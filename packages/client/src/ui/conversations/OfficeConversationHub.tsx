import { availabilityPolicy, type MeetActionCommand, type UserStatus } from "@gammyverse/shared";
import { ConversationControls } from "./ConversationControls";
import { PublicConversationDialog } from "./PublicConversationDialog";
import { MeetOfferCard } from "./MeetOfferCard";
import { MeetOfferTray } from "./MeetOfferTray";
import { ConversationAccessPanel } from "./ConversationAccessPanel";
import type { OfficeConversationsModel } from "./useOfficeConversations";

const AVAILABLE_TO_LISTEN_LABEL = "Set your availability to Available before listening or joining.";
const MEETING_REQUEST_LABEL = "Meeting request";
export interface OfficeConversationControlsProps {
  model: OfficeConversationsModel;
  connected: boolean;
  userStatus: UserStatus;
}
export function OfficeConversationControls({ model, connected, userStatus }: OfficeConversationControlsProps) {
  const { conversation, listening } = model;
  return <ConversationControls conversationId={conversation?.conversation?.id ?? null}
    mode={listening.mode} effectiveMode={listening.effectiveMode} autoListen={listening.autoListen}
    connected={connected} disabledReason={availabilityPolicy(userStatus).suppressAutomaticMedia ? AVAILABLE_TO_LISTEN_LABEL : null}
    onModeChange={listening.setMode} onAutoListenChange={listening.setAutoListen} />;
}
export interface OfficeConversationHubProps extends OfficeConversationControlsProps {
  open: boolean;
  localSessionId: string | null;
  onOpen(): void;
  onClose(): void;
  onApproach(conversationId: string): void;
  onOfferAction(offerId: string, action: MeetActionCommand["action"]): void;
}
export function OfficeConversationHub(props: OfficeConversationHubProps) {
  const { model, connected, userStatus, localSessionId } = props;
  const { conversation, publicConversations, meetOffers } = model;
  const incoming = meetOffers.offers.filter(offer => offer.to.sessionId === localSessionId
    && offer.state === "pending" && offer.expiresAtMs > meetOffers.nowMs);
  const mediaSuppressed = availabilityPolicy(userStatus).suppressAutomaticMedia;
  return <>
    {props.open && <PublicConversationDialog conversations={publicConversations.conversations}
      currentConversationId={conversation?.conversation?.id ?? null} pending={publicConversations.pending}
      error={publicConversations.error} disabled={!connected} onClose={props.onClose} onApproach={props.onApproach}
      controls={<><OfficeConversationControls model={model} connected={connected} userStatus={userStatus} />
        <ConversationAccessPanel access={model.privateAccess} connected={connected} />
        <MeetOfferTray offers={meetOffers.offers.filter(offer => offer.from.sessionId === localSessionId)} localSessionId={localSessionId ?? ""}
          status={userStatus} nowMs={meetOffers.nowMs} pending={meetOffers.pending} error={meetOffers.error}
          onAction={props.onOfferAction} /></>} />}
    {incoming.length > 0 && <section className="meet-request-popup" role="dialog" aria-label={MEETING_REQUEST_LABEL}>
      <h2>{MEETING_REQUEST_LABEL}</h2>
      {incoming.map(offer => <MeetOfferCard key={offer.id} offer={offer} localSessionId={localSessionId ?? ""}
        status={userStatus} nowMs={meetOffers.nowMs} pending={meetOffers.pending} onAction={props.onOfferAction} />)}
    </section>}
    {meetOffers.error && <div className="meet-request-feedback" role="alert">{meetOffers.error}</div>}
  </>;
}
