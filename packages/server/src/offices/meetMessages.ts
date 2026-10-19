import { randomUUID } from "node:crypto";
import { isMeetActionCommand, isMeetCreateCommand, isMeetSyncCommand, isValidStatusRequestId, type MeetActionCommand, type MeetCreateCommand, type MeetOffer, type MeetParty } from "@gammyverse/shared";
import { getOfficeRole } from "./repository.js";
import { MeetRequests } from "./meetRequests.js";
import { isPublicMeetPoint, meetParticipantAvailable, planMeetRoutes, type MeetGeometry, type MeetRoutePlan, type MeetTravelParticipant } from "./meetRoutePlanner.js";

export type MeetState = {
  participant(sessionId: string): MeetTravelParticipant | undefined;
  geometry(): MeetGeometry;
  commit(plan: MeetRoutePlan): void;
  send(sessionId: string, event: string, payload: unknown): void;
};
type MeetOptions = { role?: (username: string, officeId: string) => Promise<string | null>; nowMs?: () => number; id?: () => string };
type MeetClient = { sessionId: string };
type MeetRoom = { onMessage(event: string, handler: (client: MeetClient, payload: unknown) => void): unknown };
type AcceptanceSnapshot = { from: MeetTravelParticipant; to: MeetTravelParticipant; fromEpoch: number; toEpoch: number; geometryRevision: number };
const MEET_EXPIRY_CHECK_INTERVAL_MS = 500;
const INVALID_REQUEST_LABEL = "Invalid meet request.";
const UNAVAILABLE_LABEL = "This invitation is no longer available.";
const FORBIDDEN_LABEL = "This invitation belongs to another participant.";
const STALE_LABEL = "This invitation changed. Refresh before trying again.";
const BUSY_LABEL = "This invitation is already being accepted.";
const INVALID_PARTICIPANT_LABEL = "Both people must be available in a public area.";
const REQUEST_FAILED_LABEL = "Meet request could not be completed.";
const NO_ROLE_LABEL = "Office membership is required for this invitation.";
const MEET_OFFERS_EVENT_LABEL = "meet-offers";
const MEET_ERROR_EVENT_LABEL = "meet-error";
function commandRequestId(value: unknown) {
  if (typeof value !== "object" || value === null || !("requestId" in value)) return undefined;
  return isValidStatusRequestId(value.requestId) ? value.requestId : undefined;
}
function party(participant: MeetTravelParticipant): MeetParty {
  return { username: participant.username, sessionId: participant.sessionId, displayName: participant.displayName };
}
export class MeetMessages {
  readonly requests: MeetRequests;
  private readonly epochs = new Map<string, number>();
  private readonly availabilitySessions = new Set<string>();
  private readonly accepting = new Set<string>();
  private readonly role: NonNullable<MeetOptions["role"]>;
  private readonly nowMs: () => number;
  private readonly id: () => string;
  private disposed = false;
  constructor(private readonly officeId: string, private readonly roomIncarnationId: string, private readonly state: MeetState, options: MeetOptions = {}) {
    this.requests = new MeetRequests(officeId, roomIncarnationId);
    this.role = options.role ?? getOfficeRole;
    this.nowMs = options.nowMs ?? Date.now;
    this.id = options.id ?? randomUUID;
  }
  sync(sessionId: string, requestId?: string) {
    if (this.disposed || !this.state.participant(sessionId)?.active) return;
    this.state.send(sessionId, MEET_OFFERS_EVENT_LABEL, { officeId: this.officeId, roomIncarnationId: this.roomIncarnationId, revision: this.requests.revision, offers: this.requests.visible(sessionId), ...(requestId ? { requestId } : {}) });
  }
  private error(sessionId: string, requestId: string | undefined, error: string) {
    if (!this.disposed && requestId) this.state.send(sessionId, MEET_ERROR_EVENT_LABEL, { requestId, error });
  }
  private publish(offers: readonly MeetOffer[]) {
    const sessions = new Set(offers.flatMap(offer => [offer.from.sessionId, offer.to.sessionId]));
    for (const sessionId of sessions) this.sync(sessionId);
  }
  private epoch(sessionId: string) { return this.epochs.get(sessionId) ?? 0; }
  intentChanged(sessionId: string) { this.epochs.set(sessionId, this.epoch(sessionId) + 1); }
  enforceAvailability() {
    for (const sessionId of this.availabilitySessions) {
      const participant = this.state.participant(sessionId);
      if (!participant || !meetParticipantAvailable(participant)) this.removeSession(sessionId);
    }
  }
  removeSession(sessionId: string) {
    this.availabilitySessions.delete(sessionId);
    this.intentChanged(sessionId);
    this.publish(this.requests.removeSession(sessionId));
    this.epochs.delete(sessionId);
  }
  mapChanged() { this.publish(this.requests.invalidateAll()); }
  expire() { if (!this.disposed) this.publish(this.requests.expire(this.nowMs())); }
  dispose() { this.disposed = true; this.requests.invalidateAll(); this.epochs.clear(); this.availabilitySessions.clear(); }
  private snapshot(fromId: string, toId: string): AcceptanceSnapshot | null {
    const from = this.state.participant(fromId); const to = this.state.participant(toId);
    if (!from || !to || from.username === to.username || !meetParticipantAvailable(from) || !meetParticipantAvailable(to)) return null;
    const geometry = this.state.geometry();
    if (!isPublicMeetPoint(from, geometry) || !isPublicMeetPoint(to, geometry)) return null;
    this.availabilitySessions.add(fromId); this.availabilitySessions.add(toId);
    return { from: { ...from }, to: { ...to }, fromEpoch: this.epoch(fromId), toEpoch: this.epoch(toId), geometryRevision: geometry.revision };
  }
  private current(snapshot: AcceptanceSnapshot) {
    const next = this.snapshot(snapshot.from.sessionId, snapshot.to.sessionId);
    return !this.disposed && next !== null && next.from.username === snapshot.from.username && next.to.username === snapshot.to.username
      && next.fromEpoch === snapshot.fromEpoch && next.toEpoch === snapshot.toEpoch && next.geometryRevision === snapshot.geometryRevision;
  }
  private async authorized(snapshot: AcceptanceSnapshot) {
    const roles = await Promise.all([this.role(snapshot.from.username, this.officeId), this.role(snapshot.to.username, this.officeId)]);
    if (!roles.every(Boolean)) throw new Error(NO_ROLE_LABEL);
  }
  async create(client: MeetClient, payload: unknown) {
    const requestId = commandRequestId(payload);
    if (!isMeetCreateCommand(payload)) { this.error(client.sessionId, requestId, INVALID_REQUEST_LABEL); return; }
    if (this.disposed) return;
    this.expire();
    if (this.requests.replay(client.sessionId, payload.requestId)) { this.sync(client.sessionId, requestId); return; }
    await this.createOffer(client.sessionId, payload);
  }
  private async createOffer(sessionId: string, command: MeetCreateCommand) {
    let reservation: ReturnType<MeetRequests["reserve"]> | undefined;
    try {
      const snapshot = this.snapshot(sessionId, command.targetSessionId);
      if (!snapshot) throw new Error(INVALID_PARTICIPANT_LABEL);
      reservation = this.requests.reserve(sessionId, command, this.nowMs());
      await this.authorized(snapshot);
      if (!reservation.valid || !this.current(snapshot)) throw new Error(UNAVAILABLE_LABEL);
      const offer = this.requests.create(reservation, command, party(snapshot.from), party(snapshot.to), this.nowMs(), this.id());
      this.publish([offer]); this.sync(sessionId, command.requestId);
    } catch (error) { this.error(sessionId, command.requestId, error instanceof Error ? error.message : REQUEST_FAILED_LABEL); }
    finally { if (reservation) this.requests.release(reservation); }
  }
  async action(client: MeetClient, payload: unknown) {
    const requestId = commandRequestId(payload);
    if (!isMeetActionCommand(payload)) { this.error(client.sessionId, requestId, INVALID_REQUEST_LABEL); return; }
    if (this.disposed) return;
    this.expire();
    try {
      const offer = this.actionOffer(client.sessionId, payload);
      if (offer.state !== "pending") { this.sync(client.sessionId, requestId); return; }
      if (payload.action === "accept") await this.accept(offer, payload);
      else this.requests.finish(offer, payload.action === "decline" ? "declined" : "cancelled");
      this.publish([offer]); this.sync(client.sessionId, requestId);
    } catch (error) { this.error(client.sessionId, requestId, error instanceof Error ? error.message : REQUEST_FAILED_LABEL); }
  }
  private actionOffer(sessionId: string, command: MeetActionCommand) {
    const offer = this.requests.get(command.offerId);
    if (!offer) throw new Error(UNAVAILABLE_LABEL);
    const partyId = command.action === "cancel" ? offer.from.sessionId : offer.to.sessionId;
    if (partyId !== sessionId) throw new Error(FORBIDDEN_LABEL);
    const terminal = command.action === "accept" ? "accepted" : command.action === "decline" ? "declined" : "cancelled";
    if (offer.state !== "pending") {
      if (offer.state !== terminal) throw new Error(UNAVAILABLE_LABEL);
    } else if (offer.revision !== command.expectedRevision) throw new Error(STALE_LABEL);
    return offer;
  }
  private async accept(offer: MeetOffer, command: MeetActionCommand) {
    if (this.accepting.has(offer.id)) throw new Error(BUSY_LABEL);
    const snapshot = this.snapshot(offer.from.sessionId, offer.to.sessionId);
    if (!snapshot) { this.requests.finish(offer, "unavailable"); this.publish([offer]); throw new Error(INVALID_PARTICIPANT_LABEL); }
    this.accepting.add(offer.id);
    try {
      await this.authorized(snapshot);
      this.assertAcceptCurrent(offer, command, snapshot);
      const current = this.snapshot(offer.from.sessionId, offer.to.sessionId)!;
      const plan = planMeetRoutes(offer.kind, current.from, current.to, this.state.geometry());
      if (!plan) throw new Error(UNAVAILABLE_LABEL);
      this.state.commit(plan);
      this.intentChanged(offer.from.sessionId); this.intentChanged(offer.to.sessionId);
      this.requests.finish(offer, "accepted");
    } catch (error) {
      this.requests.finish(offer, "unavailable"); this.publish([offer]); throw error;
    } finally { this.accepting.delete(offer.id); }
  }
  private assertAcceptCurrent(offer: MeetOffer, command: MeetActionCommand, snapshot: AcceptanceSnapshot) {
    if (offer.state !== "pending" || offer.revision !== command.expectedRevision || offer.expiresAtMs <= this.nowMs() || !this.current(snapshot)) throw new Error(UNAVAILABLE_LABEL);
  }
}
export function registerMeetMessages(room: MeetRoom, messages: MeetMessages) {
  room.onMessage("meet-create", (client, payload) => { void messages.create(client, payload); });
  room.onMessage("meet-action", (client, payload) => { void messages.action(client, payload); });
  room.onMessage("meet-sync", (client, payload) => { if (isMeetSyncCommand(payload)) messages.sync(client.sessionId); });
  const timer = setInterval(() => messages.expire(), MEET_EXPIRY_CHECK_INTERVAL_MS);
  timer.unref();
  return () => { clearInterval(timer); messages.dispose(); };
}
