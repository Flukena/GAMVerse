import type { Room } from "@colyseus/sdk";
import type { UserStatus } from "@gammyverse/shared";
import { deriveConversationVoiceTarget } from "../media/conversationState";
import { useConversation } from "../media/useConversation";
import { useConversationListening } from "./useConversationListening";
import { usePublicConversations } from "./usePublicConversations";
import { useMeetOffers } from "./useMeetOffers";
import { useConversationAccess } from "./useConversationAccess";
import type { ConversationAccessZone } from "./conversationAccessState";

const JOIN_TO_PUBLISH_LABEL = "Join the conversation before turning on your microphone, camera or screen share.";
export interface OfficeConversationsProps {
  room: Room | null;
  officeId: string | null;
  sessionKey: string | null;
  status: UserStatus;
  accessZoneId?: string | null;
  accessZones?: readonly ConversationAccessZone[];
}
const EMPTY_ACCESS_ZONES: readonly ConversationAccessZone[] = [];
export function useOfficeConversations({ room, officeId, sessionKey, status, accessZoneId = null, accessZones = EMPTY_ACCESS_ZONES }: OfficeConversationsProps) {
  const conversation = useConversation(room, officeId, sessionKey);
  const listening = useConversationListening({ officeId, conversationId: conversation?.conversation?.id ?? null });
  const publicConversations = usePublicConversations(room, officeId, sessionKey, conversation?.roomIncarnationId);
  const meetOffers = useMeetOffers(room, officeId, sessionKey, status, conversation?.roomIncarnationId);
  const privateAccess = useConversationAccess({ room, officeId, sessionKey, zoneId: accessZoneId, zones: accessZones, roomIncarnationId: conversation?.roomIncarnationId });
  const conversationTarget = deriveConversationVoiceTarget(conversation, sessionKey, room === null, listening.effectiveMode);
  const canPublishConversation = listening.effectiveMode === "join";
  const publishingDisabledReason = canPublishConversation ? null : JOIN_TO_PUBLISH_LABEL;
  return { conversation, listening, publicConversations, meetOffers, privateAccess, conversationTarget, canPublishConversation, publishingDisabledReason };
}
export type OfficeConversationsModel = ReturnType<typeof useOfficeConversations>;
