import { conversationRecord as record, conversationText as text } from "./conversationValidation.js";
export const PUBLIC_CONVERSATIONS_EVENT = "public-conversations";
export const PUBLIC_CONVERSATIONS_REQUEST_EVENT = "public-conversations-request";
export const APPROACH_CONVERSATION_EVENT = "approach-conversation";
export const APPROACH_CONVERSATION_RESULT_EVENT = "approach-conversation-result";
export const PUBLIC_CONVERSATIONS_MAX_COUNT = 150;
export const PUBLIC_CONVERSATION_NAMES_MAX_COUNT = 8;
export const CONVERSATION_ACTION_MIN_INTERVAL_MS = 1000;
const CONVERSATION_IDENTIFIER_MAX_CHARACTERS = 512;
const CONVERSATION_NAME_MAX_CHARACTERS = 512;
const CONVERSATION_REQUEST_ID_MAX_CHARACTERS = 64;
export type ConversationListeningMode = "off" | "listen" | "join";
export type ConversationTokenMode = Exclude<ConversationListeningMode, "off">;
export type PublicConversationSummary = { id: string; kind: "meeting" | "proximity"; name: string; participantNames: string[]; participantCount: number; location: {x: number; z: number} };
export type PublicConversationsSnapshot = {officeId: string; roomIncarnationId: string; revision: number; conversations: PublicConversationSummary[]};
export type ApproachConversationIntent = {conversationId: string; requestId: string};
export function isConversationTokenMode(value: unknown): value is ConversationTokenMode { return value === "listen" || value === "join"; }
export function isConversationListeningMode(value: unknown): value is ConversationListeningMode { return value === "off" || isConversationTokenMode(value); }
export function isApproachConversationIntent(value: unknown): value is ApproachConversationIntent {
  return record(value) && text(value.conversationId, CONVERSATION_IDENTIFIER_MAX_CHARACTERS) && typeof value.requestId === "string" && value.requestId.length <= CONVERSATION_REQUEST_ID_MAX_CHARACTERS && /^[A-Za-z0-9_-]+$/.test(value.requestId) && Object.keys(value).every(key => key === "conversationId" || key === "requestId");
}
function summary(value: unknown): value is PublicConversationSummary {
  if (!record(value) || !text(value.id, CONVERSATION_IDENTIFIER_MAX_CHARACTERS) || !["meeting", "proximity"].includes(String(value.kind)) || !text(value.name, CONVERSATION_NAME_MAX_CHARACTERS)) return false;
  if (!Number.isSafeInteger(value.participantCount) || Number(value.participantCount) < 1 || !Array.isArray(value.participantNames) || value.participantNames.length > PUBLIC_CONVERSATION_NAMES_MAX_COUNT || !value.participantNames.every(name => text(name, CONVERSATION_NAME_MAX_CHARACTERS))) return false;
  return record(value.location) && typeof value.location.x === "number" && Number.isFinite(value.location.x) && typeof value.location.z === "number" && Number.isFinite(value.location.z);
}
export function isPublicConversationsSnapshot(value: unknown): value is PublicConversationsSnapshot {
  return record(value) && text(value.officeId, CONVERSATION_IDENTIFIER_MAX_CHARACTERS) && text(value.roomIncarnationId, CONVERSATION_IDENTIFIER_MAX_CHARACTERS) && Number.isSafeInteger(value.revision) && Number(value.revision) >= 0 && Array.isArray(value.conversations) && value.conversations.length <= PUBLIC_CONVERSATIONS_MAX_COUNT && value.conversations.every(summary);
}
