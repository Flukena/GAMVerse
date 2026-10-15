import { HAND_RAISE_MAX_DURATION_MS } from "./handRaiseLifetime.js";
import { randomUUID } from "node:crypto";
import {
  CONVERSATION_ACTION_MIN_INTERVAL_MS, CONVERSATION_MEMBERS_MAX_COUNT,
  MEETING_HAND_RESULT_EVENT, MEETING_HANDS_SNAPSHOT_EVENT,
  isMeetingHandCommand, isMeetingHandsRequest, isValidHandRaise,
  type MeetingHandCommand, type MeetingHandContext, type MeetingHandResult,
  type MeetingHandsRequest, type MeetingHandsSnapshot, type PlayerState,
} from "@gammyverse/shared";
import { getSession } from "../auth/service.js";
import { logServerError } from "../infra/logger.js";
import { getOfficeRole } from "./repository.js";
import { MeetingHands } from "./meetingHands.js";
import { readReconnectAccess, type SessionSecurity } from "./sessionSecurity.js";
import type { SpatialConversations } from "./spatialConversations.js";
import type { PrivateConversations } from "./privateConversations.js";

const HAND_ACCESS_DENIED_LABEL = "This conversation is no longer available.";
const HAND_BUSY_LABEL = "Wait a moment before updating your hand.";
const HAND_AUTH_FAILED_EVENT = "meeting.hand.access.failed";
const HAND_AUTH_FAILED_LABEL = "Hand access verification failed.";
type HandPlayers = Iterable<[string, PlayerState]> & { get(sessionId: string): PlayerState | undefined };
export type MeetingHandState = {
  players: HandPlayers;
  security: Pick<SessionSecurity, "activeSession" | "isRevoked" | "token">;
  conversations: Pick<SpatialConversations, "all">;
  zones: ReadonlyMap<string, { id: string }>;
  privacy?: Pick<PrivateConversations, "mayHear">;
};
type AccessQueries = Parameters<typeof readReconnectAccess>[3];
export type MeetingHandEvent = { sessionId: string; event: string; payload: MeetingHandsSnapshot | MeetingHandResult };
type Pending = { valid: boolean };

export class MeetingHandCoordinator {
  private readonly hands = new MeetingHands();
  private readonly contexts = new Map<string, string>();
  private readonly outgoing = new Map<string, MeetingHandEvent>();
  private readonly pending = new Map<string, Pending>();
  private readonly lastCommandAt = new Map<string, number>();
  private readonly lastRequestAt = new Map<string, number>();
  private disposed = false;
  private readonly raisedAt = new Map<string, number>();

  constructor(readonly officeId: string, readonly roomIncarnationId: string,
    private readonly state: MeetingHandState,
    private readonly queries: AccessQueries = { account: getSession, officeRole: getOfficeRole },
    private readonly nowMs: () => number = Date.now) {}

  private active(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player || player.presence !== "online" || this.state.security.isRevoked(sessionId) || this.state.security.activeSession(player.username) !== sessionId) return undefined;
    const zone = this.state.zones.get(sessionId);
    if (zone && this.state.privacy && !this.state.privacy.mayHear(sessionId, zone.id)) return undefined;
    return player;
  }

  refresh(): MeetingHandEvent[] {
    if (this.disposed) return [];
    this.expireHands();
    const conversations = this.state.conversations.all().map(conversation => ({ ...conversation,
      members: conversation.members.filter(member => this.active(member.sessionId)?.username === member.username),
    })).filter(conversation => conversation.members.length > 0);
    const changed = this.hands.reconcile(conversations);
    const nextContexts = new Map<string, string>();
    for (const conversation of conversations) {
      for (const member of conversation.members) {
        nextContexts.set(member.sessionId, conversation.id);
        if (this.contexts.get(member.sessionId) !== conversation.id) {
          this.invalidatePending(member.sessionId);
          this.raisedAt.delete(member.sessionId);
          const player = this.state.players.get(member.sessionId);
          if (player) player.handRaised = false;
          this.queueSnapshot(member.sessionId, conversation.id);
        } else if (changed.has(conversation.id)) this.queueSnapshot(member.sessionId, conversation.id);
      }
    }
    for (const sessionId of this.contexts.keys()) {
      if (nextContexts.has(sessionId)) continue;
      this.invalidatePending(sessionId);
      this.raisedAt.delete(sessionId);
      const player = this.state.players.get(sessionId);
      if (player) player.handRaised = false;
    }
    this.contexts.clear();
    for (const [sessionId, id] of nextContexts) this.contexts.set(sessionId, id);
    return this.currentEvents(this.drain());
  }

  private queueSnapshot(sessionId: string, conversationId: string) {
    const snapshot = this.hands.snapshot(conversationId);
    if (snapshot) this.outgoing.set(sessionId, { sessionId, event: MEETING_HANDS_SNAPSHOT_EVENT,
      payload: { officeId: this.officeId, roomIncarnationId: this.roomIncarnationId, conversationId, ...snapshot } });
  }

  private currentEvents(events: MeetingHandEvent[], deniedSessionId?: string): MeetingHandEvent[] {
    if (this.disposed) return [];
    const denied = new Set(events.filter(event => event.event === MEETING_HAND_RESULT_EVENT && "ok" in event.payload && !event.payload.ok).map(event => event.sessionId));
    if (deniedSessionId) denied.add(deniedSessionId);
    const latest = new Map<string, MeetingHandEvent>();
    const results: MeetingHandEvent[] = [];
    for (const event of events) {
      if (event.event !== MEETING_HANDS_SNAPSHOT_EVENT) { results.push(event); continue; }
      if (denied.has(event.sessionId) || !this.active(event.sessionId)) continue;
      const conversationId = this.contexts.get(event.sessionId);
      if (!conversationId) continue;
      const snapshot = this.hands.snapshot(conversationId);
      if (snapshot) latest.set(event.sessionId, { sessionId: event.sessionId, event: MEETING_HANDS_SNAPSHOT_EVENT,
        payload: { officeId: this.officeId, roomIncarnationId: this.roomIncarnationId, conversationId, ...snapshot } });
    }
    return [...latest.values(), ...results];
  }

  private drain(): MeetingHandEvent[] {
    const events = [...this.outgoing.values()];
    this.outgoing.clear();
    return events;
  }

  private matches(sessionId: string, context: MeetingHandContext): boolean {
    return !!this.active(sessionId) && context.officeId === this.officeId && context.roomIncarnationId === this.roomIncarnationId && this.contexts.get(sessionId) === context.conversationId;
  }

  private result(sessionId: string, request: MeetingHandsRequest, error?: string): MeetingHandEvent {
    return { sessionId, event: MEETING_HAND_RESULT_EVENT, payload: {
      officeId: request.officeId, roomIncarnationId: request.roomIncarnationId,
      conversationId: request.conversationId, requestId: request.requestId, ok: !error, ...(error ? { error } : {}),
    } };
  }

  private begin(sessionId: string, times: Map<string, number>): Pending | undefined {
    const nowMs = this.nowMs();
    const lastMs = times.get(sessionId);
    if (this.disposed || this.pending.has(sessionId) || this.pending.size >= CONVERSATION_MEMBERS_MAX_COUNT || (lastMs !== undefined && nowMs - lastMs < CONVERSATION_ACTION_MIN_INTERVAL_MS)) return undefined;
    const pending = { valid: true };
    this.pending.set(sessionId, pending);
    times.set(sessionId, nowMs);
    return pending;
  }

  private async authorized(sessionId: string, pending: Pending): Promise<boolean> {
    const player = this.active(sessionId);
    if (!player) return false;
    const access = await readReconnectAccess(player.username, this.state.security.token(sessionId), this.officeId, this.queries);
    if (access.error) logServerError("realtime", HAND_AUTH_FAILED_EVENT, new Error(HAND_AUTH_FAILED_LABEL));
    return pending.valid && !this.disposed && this.state.players.get(sessionId) === player && !!this.active(sessionId) && access.accountActive && access.officeMember;
  }

  private finish(sessionId: string, pending: Pending) {
    if (this.pending.get(sessionId) === pending) this.pending.delete(sessionId);
  }

  async request(sessionId: string, payload: unknown): Promise<MeetingHandEvent[]> {
    if (!isMeetingHandsRequest(payload) || this.disposed) return [];
    const events = this.refresh();
    if (!this.matches(sessionId, payload)) return this.currentEvents([...events, this.result(sessionId, payload, HAND_ACCESS_DENIED_LABEL)], sessionId);
    const pending = this.begin(sessionId, this.lastRequestAt);
    if (!pending) return [...events, this.result(sessionId, payload, HAND_BUSY_LABEL)];
    const authorized = await this.authorized(sessionId, pending);
    this.finish(sessionId, pending);
    if (!pending.valid || this.disposed) return this.disposed ? [] : this.currentEvents(events, sessionId);
    events.push(...this.refresh());
    if (!authorized || !this.matches(sessionId, payload)) return this.currentEvents([...events, this.result(sessionId, payload, HAND_ACCESS_DENIED_LABEL)], sessionId);
    this.queueSnapshot(sessionId, payload.conversationId);
    return this.currentEvents([...events, ...this.drain(), this.result(sessionId, payload)]);
  }

  async command(sessionId: string, payload: unknown): Promise<MeetingHandEvent[]> {
    if (!isMeetingHandCommand(payload) || this.disposed) return [];
    return this.execute(sessionId, payload);
  }

  private async execute(sessionId: string, command: MeetingHandCommand, mapOnly = false): Promise<MeetingHandEvent[]> {
    const events = this.refresh();
    if (!(mapOnly ? this.active(sessionId) && !this.contexts.has(sessionId) : this.matches(sessionId, command))) return this.currentEvents([...events, this.result(sessionId, command, HAND_ACCESS_DENIED_LABEL)], sessionId);
    const pending = this.begin(sessionId, this.lastCommandAt);
    if (!pending) return [...events, this.result(sessionId, command, HAND_BUSY_LABEL)];
    const authorized = await this.authorized(sessionId, pending);
    this.finish(sessionId, pending);
    if (!pending.valid || this.disposed) return this.disposed ? [] : this.currentEvents(events, sessionId);
    events.push(...this.refresh());
    const sameContext = mapOnly ? !this.contexts.has(sessionId) : this.matches(sessionId, command);
    if (!authorized || !sameContext) return this.currentEvents([...events, this.result(sessionId, command, HAND_ACCESS_DENIED_LABEL)], sessionId);
    const player = this.active(sessionId);
    if (!player) return this.currentEvents([...events, this.result(sessionId, command, HAND_ACCESS_DENIED_LABEL)], sessionId);
    if (mapOnly) {
      this.updateLifetime(sessionId, command.raised, player.handRaised);
      player.handRaised = command.raised;
    } else this.apply(command, sessionId, player);
    return this.currentEvents([...events, ...this.drain(), this.result(sessionId, command)]);
  }

  private apply(command: MeetingHandCommand, sessionId: string, player: PlayerState) {
    const wasRaised = this.hands.snapshot(command.conversationId)?.entries.some(entry => entry.sessionId === sessionId) ?? false;
    this.updateLifetime(sessionId, command.raised, wasRaised);
    if (this.hands.setRaised(command.conversationId, sessionId, command.raised)) {
      for (const [id, context] of this.contexts) if (context === command.conversationId) this.queueSnapshot(id, context);
    }
    player.handRaised = this.hands.snapshot(command.conversationId)?.entries.some(entry => entry.sessionId === sessionId) ?? false;
  }

  async legacy(sessionId: string, payload: unknown): Promise<MeetingHandEvent[]> {
    if (!isValidHandRaise(payload) || this.disposed) return [];
    const events = this.refresh();
    const conversationId = this.contexts.get(sessionId);
    const command = { officeId: this.officeId, roomIncarnationId: this.roomIncarnationId,
      conversationId: conversationId ?? sessionId, requestId: randomUUID(), raised: payload.raised };
    return this.currentEvents([...events, ...await this.execute(sessionId, command, !conversationId)]);
  }

  private updateLifetime(sessionId: string, raised: boolean, wasRaised: boolean) {
    if (!raised) this.raisedAt.delete(sessionId);
    else if (!wasRaised) this.raisedAt.set(sessionId, this.nowMs());
  }

  private expireHands() {
    for (const [sessionId, raisedAtMs] of this.raisedAt) {
      if (this.active(sessionId) && this.nowMs() - raisedAtMs < HAND_RAISE_MAX_DURATION_MS) continue;
      this.raisedAt.delete(sessionId);
      const player = this.state.players.get(sessionId);
      if (player) player.handRaised = false;
      const conversationId = this.contexts.get(sessionId);
      if (!conversationId || !this.hands.setRaised(conversationId, sessionId, false)) continue;
      for (const [id, context] of this.contexts) if (context === conversationId) this.queueSnapshot(id, context);
    }
  }

  private invalidatePending(sessionId: string) {
    const pending = this.pending.get(sessionId);
    if (pending) pending.valid = false;
  }

  removeSession(sessionId: string) {
    this.raisedAt.delete(sessionId);
    this.invalidatePending(sessionId);
    this.pending.delete(sessionId);
    this.lastCommandAt.delete(sessionId);
    this.lastRequestAt.delete(sessionId);
    this.outgoing.delete(sessionId);
  }

  dispose() {
    this.disposed = true;
    for (const pending of this.pending.values()) pending.valid = false;
    this.pending.clear();
    this.raisedAt.clear();
    this.outgoing.clear();
    this.contexts.clear();
    this.lastCommandAt.clear();
    this.lastRequestAt.clear();
  }
}
