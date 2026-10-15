import type { Room } from "@colyseus/sdk";
import { availabilityPolicy, type UserStatus } from "@gammyverse/shared";
import { deriveConversationVoiceTarget } from "../media/conversationState";
import { useConversation } from "../media/useConversation";
import { useMeetingHands } from "../meetings/useMeetingHands";
import { useMeetingParticipants, type BoundMeetingRoom } from "../media/useMeetingParticipants";
import { useConversationListening } from "./useConversationListening";
import { usePublicConversations } from "./usePublicConversations";
import { useMeetOffers } from "./useMeetOffers";
import { useConversationAccess } from "./useConversationAccess";
import type { ConversationAccessZone } from "./conversationAccessState";

const AVAILABILITY_UNAVAILABLE_LABEL = "Unavailable for your current availability";
const JOIN_TO_PUBLISH_LABEL = "Join the conversation before turning on your microphone, camera or screen share.";
export interface OfficeConversationsProps {
  room: Room | null;
  officeId: string | null;
  sessionKey: string | null;
  status: UserStatus;
  boundMeetingRoom: BoundMeetingRoom;
  localSessionId: string | null;
  accessZoneId?: string | null;
  accessZones?: readonly ConversationAccessZone[];
}
const EMPTY_ACCESS_ZONES: readonly ConversationAccessZone[] = [];
export function useOfficeConversations({ room, officeId, sessionKey, status, boundMeetingRoom, localSessionId, accessZoneId = null, accessZones = EMPTY_ACCESS_ZONES }: OfficeConversationsProps) {
  const mediaSuppressed = availabilityPolicy(status).suppressAutomaticMedia;
  const conversation = useConversation(room, officeId, sessionKey);
  const meetingHands = useMeetingHands(room, conversation, sessionKey);
  const listening = useConversationListening({ officeId, conversationId: conversation?.conversation?.id ?? null, status });
  const publicConversations = usePublicConversations(room, officeId, sessionKey, conversation?.roomIncarnationId);
  const meetOffers = useMeetOffers(room, officeId, sessionKey, status, conversation?.roomIncarnationId);
  const privateAccess = useConversationAccess({ room, officeId, sessionKey, zoneId: accessZoneId, zones: accessZones, roomIncarnationId: conversation?.roomIncarnationId });
  const meetingParticipants = useMeetingParticipants(conversation, boundMeetingRoom, sessionKey, localSessionId ?? undefined, listening.effectiveMode);
  const conversationTarget = deriveConversationVoiceTarget(conversation, sessionKey, mediaSuppressed || room === null, listening.effectiveMode);
  const canPublishConversation = listening.effectiveMode === "join" && !mediaSuppressed;
  const publishingDisabledReason = mediaSuppressed ? AVAILABILITY_UNAVAILABLE_LABEL : canPublishConversation ? null : JOIN_TO_PUBLISH_LABEL;
  return { conversation, meetingHands, listening, publicConversations, meetOffers, privateAccess, meetingParticipants, conversationTarget, canPublishConversation, publishingDisabledReason };
}
export type OfficeConversationsModel = ReturnType<typeof useOfficeConversations>;
