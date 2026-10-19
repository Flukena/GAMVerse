import type { MeetActionCommand, MeetOffer, UserStatus } from "@gammyverse/shared";
import { MeetOfferCard } from "./MeetOfferCard";
import "./Conversations.css";

const INVITATIONS_LABEL = "Meeting invitations";
const EMPTY_LABEL = "No meeting invitations.";
const VISIBLE_TERMINAL_OFFERS_MAX_COUNT = 3;
export interface MeetOfferTrayProps {
  offers: readonly MeetOffer[];
  localSessionId: string;
  status: UserStatus;
  nowMs: number;
  pending: boolean;
  error: string | null;
  onAction(offerId: string, action: MeetActionCommand["action"]): void;
}
export function MeetOfferTray(props: MeetOfferTrayProps) {
  const own = props.offers.filter(offer => offer.from.sessionId === props.localSessionId || offer.to.sessionId === props.localSessionId);
  const active = own.filter(offer => offer.state === "pending");
  const ended = own.filter(offer => offer.state !== "pending").sort((first, second) => second.expiresAtMs - first.expiresAtMs).slice(0, VISIBLE_TERMINAL_OFFERS_MAX_COUNT);
  const visible = [...active, ...ended];
  return <section className="meet-offer-tray" aria-label={INVITATIONS_LABEL}>
    <h2>{INVITATIONS_LABEL}</h2>
    {visible.length === 0 && <p>{EMPTY_LABEL}</p>}
    {props.error && <p role="alert">{props.error}</p>}
    {visible.map(offer => <MeetOfferCard key={offer.id} {...props} offer={offer} />)}
  </section>;
}
