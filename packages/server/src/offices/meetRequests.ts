import { MEET_OFFER_TTL_MS, type MeetCreateCommand, type MeetOffer, type MeetOfferState, type MeetParty } from "@gammyverse/shared";

export const MEET_CREATE_INTERVAL_MS = 1_000;
const MAX_OUTGOING_OFFERS_COUNT = 1;
const MAX_INCOMING_OFFERS_COUNT = 4;
const MAX_TERMINAL_OFFERS_COUNT = 256;
const INITIAL_OFFER_REVISION_COUNT = 1;
const REQUEST_BUSY_LABEL = "A meet request is already pending.";
const INCOMING_FULL_LABEL = "This person has too many pending invitations.";
const RATE_LIMIT_LABEL = "Wait a moment before sending another invitation.";
export type MeetReservation = { sessionId: string; targetSessionId: string; requestId: string; valid: boolean };
export class MeetRequests {
  revision = INITIAL_OFFER_REVISION_COUNT;
  private readonly offers = new Map<string, MeetOffer>();
  private readonly createRequestIds = new Map<string, string>();
  private readonly reservations = new Map<string, MeetReservation>();
  private readonly lastCreateAtMs = new Map<string, number>();
  constructor(readonly officeId: string, readonly roomIncarnationId: string) {}
  private requestKey(sessionId: string, requestId: string) { return `${sessionId}:${requestId}`; }
  replay(sessionId: string, requestId: string) {
    const id = this.createRequestIds.get(this.requestKey(sessionId, requestId));
    return id ? this.offers.get(id) : undefined;
  }
  reserve(sessionId: string, command: MeetCreateCommand, nowMs: number): MeetReservation {
    const previousMs = this.lastCreateAtMs.get(sessionId);
    if (previousMs !== undefined && nowMs - previousMs < MEET_CREATE_INTERVAL_MS) throw new Error(RATE_LIMIT_LABEL);
    if (this.reservations.has(sessionId) || this.pending(sessionId, "from").length >= MAX_OUTGOING_OFFERS_COUNT) throw new Error(REQUEST_BUSY_LABEL);
    const incomingReservations = [...this.reservations.values()].filter(entry => entry.targetSessionId === command.targetSessionId).length;
    if (this.pending(command.targetSessionId, "to").length + incomingReservations >= MAX_INCOMING_OFFERS_COUNT) throw new Error(INCOMING_FULL_LABEL);
    const reservation = { sessionId, targetSessionId: command.targetSessionId, requestId: command.requestId, valid: true };
    this.reservations.set(sessionId, reservation);
    this.lastCreateAtMs.set(sessionId, nowMs);
    return reservation;
  }
  release(reservation: MeetReservation) { if (this.reservations.get(reservation.sessionId) === reservation) this.reservations.delete(reservation.sessionId); }
  create(reservation: MeetReservation, command: MeetCreateCommand, from: MeetParty, to: MeetParty, nowMs: number, id: string) {
    const offer: MeetOffer = { id, officeId: this.officeId, roomIncarnationId: this.roomIncarnationId, kind: command.kind, from: { ...from }, to: { ...to }, expiresAtMs: nowMs + MEET_OFFER_TTL_MS, state: "pending", revision: INITIAL_OFFER_REVISION_COUNT };
    this.offers.set(id, offer);
    this.revision += 1;
    this.createRequestIds.set(this.requestKey(from.sessionId, command.requestId), id);
    this.release(reservation);
    return offer;
  }
  get(id: string) { return this.offers.get(id); }
  visible(sessionId: string) { return [...this.offers.values()].filter(offer => offer.from.sessionId === sessionId || offer.to.sessionId === sessionId); }
  pending(sessionId: string, side: "from" | "to") { return [...this.offers.values()].filter(offer => offer.state === "pending" && offer[side].sessionId === sessionId); }
  finish(offer: MeetOffer, state: Exclude<MeetOfferState, "pending">) {
    if (offer.state !== "pending") return false;
    offer.state = state; offer.revision += 1; this.revision += 1;
    this.pruneTerminals();
    return true;
  }
  expire(nowMs: number) {
    const expired = [...this.offers.values()].filter(offer => offer.state === "pending" && offer.expiresAtMs <= nowMs);
    for (const offer of expired) this.finish(offer, "expired");
    return expired;
  }
  removeSession(sessionId: string) {
    const affected = this.visible(sessionId).filter(offer => offer.state === "pending");
    for (const offer of affected) this.finish(offer, "unavailable");
    for (const reservation of this.reservations.values()) if (reservation.sessionId === sessionId || reservation.targetSessionId === sessionId) reservation.valid = false;
    this.lastCreateAtMs.delete(sessionId);
    return affected;
  }
  invalidateAll() {
    const affected = [...this.offers.values()].filter(offer => offer.state === "pending");
    for (const offer of affected) this.finish(offer, "unavailable");
    for (const reservation of this.reservations.values()) reservation.valid = false;
    return affected;
  }
  private pruneTerminals() {
    const terminal = [...this.offers.values()].filter(offer => offer.state !== "pending");
    for (const offer of terminal.slice(0, Math.max(0, terminal.length - MAX_TERMINAL_OFFERS_COUNT))) {
      this.offers.delete(offer.id);
      for (const [key, id] of this.createRequestIds) if (id === offer.id) this.createRequestIds.delete(key);
    }
  }
}
