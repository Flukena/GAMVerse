import { availabilityPolicy, isMeetOfferSnapshot, type MeetActionCommand, type MeetOffer, type MeetOfferSnapshot, type UserStatus } from "@gammyverse/shared";

export const MEET_AVAILABILITY_BLOCKED_LABEL = "Meet invitations are unavailable while you or this person are Busy, In meeting or Away.";
const EXPIRED_LABEL = "This invitation has expired.";
const TERMINAL_LABEL = "This invitation has already ended.";
const WAITING_LABEL = "Waiting for confirmation…";
const ACCEPT_LABEL = "Accept";
const DECLINE_LABEL = "Decline";
const CANCEL_LABEL = "Cancel invitation";
export type MeetOfferAction = { action: MeetActionCommand["action"]; label: string; disabled: boolean; disabledReason: string | null };
export class MeetOfferState {
  snapshot: MeetOfferSnapshot | null = null;
  constructor(readonly officeId: string, readonly sessionId: string, readonly roomIncarnationId?: string) {}
  acceptsContext(payload: unknown): payload is MeetOfferSnapshot {
    if (!isMeetOfferSnapshot(payload) || payload.officeId !== this.officeId) return false;
    const incarnation = this.roomIncarnationId ?? this.snapshot?.roomIncarnationId;
    return (!incarnation || incarnation === payload.roomIncarnationId)
      && payload.offers.every(offer => offer.from.sessionId === this.sessionId || offer.to.sessionId === this.sessionId);
  }
  receive(payload: unknown): boolean {
    if (!this.acceptsContext(payload)) return false;
    if (this.snapshot && payload.revision <= this.snapshot.revision) return false;
    if (payload.offers.some(offer => {
      const previous = this.snapshot?.offers.find(existing => existing.id === offer.id);
      return previous && offer.revision < previous.revision;
    })) return false;
    this.snapshot = payload;
    return true;
  }
}
export function meetOfferActions(offer: MeetOffer, sessionId: string, status: UserStatus, nowMs: number, pending: boolean): MeetOfferAction[] {
  if (offer.from.sessionId !== sessionId && offer.to.sessionId !== sessionId) return [];
  const expired = nowMs >= offer.expiresAtMs;
  const commonReason = offer.state !== "pending" ? TERMINAL_LABEL : expired ? EXPIRED_LABEL : pending ? WAITING_LABEL : null;
  const action = (value: MeetActionCommand["action"], label: string, requiresAvailability: boolean): MeetOfferAction => {
    const disabledReason = commonReason || (requiresAvailability && availabilityPolicy(status).suppressInterruptions ? MEET_AVAILABILITY_BLOCKED_LABEL : null);
    return { action: value, label, disabled: disabledReason !== null, disabledReason };
  };
  return offer.from.sessionId === sessionId ? [action("cancel", CANCEL_LABEL, false)] : [action("accept", ACCEPT_LABEL, true), action("decline", DECLINE_LABEL, false)];
}
