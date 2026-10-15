import type { MeetActionCommand, MeetOffer, UserStatus } from "@gammyverse/shared";
import { meetOfferActions } from "./meetOfferState";

const MILLISECONDS_PER_SECOND = 1_000;
const OFFER_STATE_LABELS: Record<MeetOffer["state"], string> = {
  pending: "Waiting for a response", accepted: "Accepted. Follow the office navigation feedback; audio joins after membership is confirmed.",
  declined: "Invitation declined", cancelled: "Invitation cancelled", expired: "Invitation expired", unavailable: "Meeting destination is unavailable. Please try again.",
};
const LOCALLY_EXPIRED_LABEL = "Invitation expired. Waiting for server confirmation.";
export interface MeetOfferCardProps {
  offer: MeetOffer;
  localSessionId: string;
  status: UserStatus;
  nowMs: number;
  pending: boolean;
  onAction(offerId: string, action: MeetActionCommand["action"]): void;
}
export function MeetOfferCard(props: MeetOfferCardProps) {
  const { offer } = props;
  const outgoing = offer.from.sessionId === props.localSessionId;
  const other = outgoing ? offer.to : offer.from;
  const displayName = other.displayName || other.username;
  const heading = offer.kind === "meet" ? `${outgoing ? "Meet invitation to" : "Meet invitation from"} ${displayName}`
    : outgoing ? `Invited ${displayName} to join you` : `${displayName} invited you to join them`;
  const expired = props.nowMs >= offer.expiresAtMs;
  const actions = meetOfferActions(offer, props.localSessionId, props.status, props.nowMs, props.pending);
  const blockedReason = actions.find(action => action.disabledReason)?.disabledReason;
  return <article className="meet-offer-card" aria-label={heading}>
    <h3>{heading}</h3>
    <p>{offer.state === "pending" && expired ? LOCALLY_EXPIRED_LABEL : OFFER_STATE_LABELS[offer.state]}</p>
    {offer.state === "pending" && !expired && <small>{Math.ceil((offer.expiresAtMs - props.nowMs) / MILLISECONDS_PER_SECOND)} seconds remaining</small>}
    {offer.state === "pending" && <div className="meet-offer-actions">{actions.map(action => <button type="button" key={action.action} disabled={action.disabled} title={action.disabledReason ?? undefined} onClick={() => props.onAction(offer.id, action.action)}>{action.label}</button>)}</div>}
    {offer.state === "pending" && blockedReason && <p className="conversation-explanation">{blockedReason}</p>}
  </article>;
}
