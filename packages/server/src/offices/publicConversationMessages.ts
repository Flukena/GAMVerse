import { APPROACH_CONVERSATION_EVENT, APPROACH_CONVERSATION_RESULT_EVENT, CONVERSATION_ACTION_MIN_INTERVAL_MS, PUBLIC_CONVERSATIONS_EVENT, PUBLIC_CONVERSATIONS_REQUEST_EVENT, isApproachConversationIntent, isConversationSnapshotRequest, type ApproachConversationIntent, type PublicConversationSummary } from "@gammyverse/shared";
import { planPublicConversationApproachRoute, type MeetGeometry, type MeetRoutePlan, type MeetTravelParticipant } from "./meetRoutePlanner.js";
import type { PublicConversations } from "./publicConversations.js";
type Client = {sessionId: string; send(event: string, payload: unknown): void};
type Room = {onMessage(event: string, handler: (client: Client, payload: unknown) => void): unknown};
export type PublicConversationState = {
  participant(sessionId: string): MeetTravelParticipant | undefined;
  authorize(sessionId: string, username: string): Promise<boolean>;
  conversation(id: string): {summary: PublicConversationSummary; meetingZoneId?: string} | undefined;
  geometry(): MeetGeometry;
  commit(plan: MeetRoutePlan): void;
  navigationIntent(sessionId: string): void;
};
const APPROACH_UNAVAILABLE_LABEL = "This conversation is no longer available to approach.";
const APPROACH_BUSY_LABEL = "Wait a moment before approaching another conversation.";
const APPROACH_FAILED_LABEL = "A walking route to this conversation is unavailable.";
export class PublicConversationMessages {
  private readonly pending = new Map<string, {valid: boolean}>();
  private readonly lastSyncAt = new Map<string, number>();
  private readonly lastAcceptedAt = new Map<string, number>();
  constructor(private readonly state: PublicConversationState, private readonly discovery: PublicConversations, private readonly nowMs: () => number = Date.now) {}
  sync(client: Client, payload: unknown) {
    if (!isConversationSnapshotRequest(payload) || !this.state.participant(client.sessionId)?.active) return;
    const nowMs = this.nowMs();
    const previousMs = this.lastSyncAt.get(client.sessionId);
    if (previousMs !== undefined && nowMs - previousMs < CONVERSATION_ACTION_MIN_INTERVAL_MS) return;
    this.lastSyncAt.set(client.sessionId,nowMs);
    client.send(PUBLIC_CONVERSATIONS_EVENT, this.discovery.snapshot());
  }
  invalidate(sessionId: string) { const pending = this.pending.get(sessionId); if (pending) pending.valid = false; }
  removeSession(sessionId: string) {this.invalidate(sessionId);this.lastAcceptedAt.delete(sessionId);this.lastSyncAt.delete(sessionId);}
  async approach(client: Client, payload: unknown) {
    if (!isApproachConversationIntent(payload)) return;
    const participant = this.state.participant(client.sessionId);
    if (!participant?.active) return;
    const nowMs = this.nowMs();
    const previousMs = this.lastAcceptedAt.get(client.sessionId);
    if (this.pending.has(client.sessionId) || (previousMs !== undefined && nowMs - previousMs < CONVERSATION_ACTION_MIN_INTERVAL_MS)) {this.failed(client,payload.requestId,APPROACH_BUSY_LABEL);return;}
    this.state.navigationIntent(client.sessionId);
    const pending = {valid: true};
    this.pending.set(client.sessionId,pending);
    this.lastAcceptedAt.set(client.sessionId,nowMs);
    try { await this.executeApproach(client,payload,participant,pending);
    } catch {if (pending.valid) this.failed(client,payload.requestId,APPROACH_FAILED_LABEL);}
    finally {if (this.pending.get(client.sessionId) === pending) this.pending.delete(client.sessionId);}
  }
  private async executeApproach(client: Client, payload: ApproachConversationIntent, participant: MeetTravelParticipant, pending: {valid: boolean}) {
      const authorized = await this.state.authorize(client.sessionId,participant.username);
      const current = this.state.participant(client.sessionId);
      if (!pending.valid) return;
      if (!authorized || !current?.active || current.username !== participant.username) {this.failed(client,payload.requestId,APPROACH_UNAVAILABLE_LABEL);return;}
      const conversation = this.state.conversation(payload.conversationId);
      if (!conversation) {this.failed(client,payload.requestId,APPROACH_UNAVAILABLE_LABEL);return;}
      const geometry = this.state.geometry();
      const route = planPublicConversationApproachRoute(current,conversation.summary.location,geometry,conversation.meetingZoneId);
      if (!route) {this.failed(client,payload.requestId,APPROACH_FAILED_LABEL);return;}
      this.state.commit({routes:[route],geometryRevision:geometry.revision});
      client.send(APPROACH_CONVERSATION_RESULT_EVENT,{requestId:payload.requestId,status:route.points.length ? "started" : "arrived"});
  }
  private failed(client: Client, requestId: string, message: string) {client.send("auto-move-status",{status:"unreachable",requestId,message});client.send(APPROACH_CONVERSATION_RESULT_EVENT,{requestId,status:"unreachable",message});}
}
export function registerPublicConversationMessages(room: Room, messages: PublicConversationMessages) {
  room.onMessage(PUBLIC_CONVERSATIONS_REQUEST_EVENT,(client,payload) => messages.sync(client,payload));
  room.onMessage(APPROACH_CONVERSATION_EVENT,(client,payload) => {void messages.approach(client,payload);});
}
