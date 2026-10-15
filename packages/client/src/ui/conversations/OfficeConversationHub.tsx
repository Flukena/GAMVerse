import { availabilityPolicy, type MeetActionCommand, type UserStatus } from "@gammyverse/shared";
import { ConversationControls } from "./ConversationControls";
import { PublicConversationDialog } from "./PublicConversationDialog";
import { MeetOfferTray } from "./MeetOfferTray";
import { ConversationAccessPanel } from "./ConversationAccessPanel";
import type { OfficeConversationsModel } from "./useOfficeConversations";

const AVAILABLE_TO_LISTEN_LABEL = "Set your availability to Available before listening or joining.";
const MEETING_INVITATION_LABEL = "Meeting invitation";
const PENDING_LABEL = "pending";
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
  const incomingCount = meetOffers.offers.filter(offer => offer.to.sessionId === localSessionId
    && offer.state === "pending" && offer.expiresAtMs > meetOffers.nowMs).length;
  const mediaSuppressed = availabilityPolicy(userStatus).suppressAutomaticMedia;
  return <>
    {props.open && <PublicConversationDialog conversations={publicConversations.conversations}
      currentConversationId={conversation?.conversation?.id ?? null} pending={publicConversations.pending}
      error={publicConversations.error} disabled={!connected} onClose={props.onClose} onApproach={props.onApproach}
      controls={<><OfficeConversationControls model={model} connected={connected} userStatus={userStatus} />
        <ConversationAccessPanel access={model.privateAccess} connected={connected} />
        <MeetOfferTray offers={meetOffers.offers} localSessionId={localSessionId ?? ""}
          status={userStatus} nowMs={meetOffers.nowMs} pending={meetOffers.pending} error={meetOffers.error}
          onAction={props.onOfferAction} /></>} />}
    {!props.open && !mediaSuppressed && incomingCount > 0 && <button type="button" className="conversation-invitation-alert" onClick={props.onOpen}>
      {MEETING_INVITATION_LABEL} · {incomingCount} {PENDING_LABEL}
    </button>}
  </>;
}
