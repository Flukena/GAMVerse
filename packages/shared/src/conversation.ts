import { conversationRecord as record, conversationText } from "./conversationValidation.js";
import { isConversationTokenMode, type ConversationTokenMode } from "./conversationListening.js";
export const CONVERSATION_SNAPSHOT_EVENT = "conversation-snapshot";
export const CONVERSATION_SNAPSHOT_REQUEST_EVENT = "conversation-snapshot-request";
export const CONVERSATION_MEMBERS_MAX_COUNT = 1000;
const CONVERSATION_FIELD_MAX_CHARACTERS = 512;
export type ConversationKind = "meeting" | "private" | "proximity";
export type ConversationMediaTarget = { id: string; generation: number; available?: boolean };
export type ConversationMember = { id: string; sessionId: string; username: string; displayName: string; characterId: string; mediaIdentity: string };
export type Conversation = { id: string; kind: ConversationKind; mediaTarget: ConversationMediaTarget; members: ConversationMember[] };
export type ConversationSnapshot = { officeId: string; roomIncarnationId: string; revision: number; admissionLeaseId?: string; conversation: Conversation | null };
export type ConversationGrantBinding = { conversationId: string; conversationGeneration: number; roomIncarnationId: string };
function text(value: unknown): value is string { return conversationText(value, CONVERSATION_FIELD_MAX_CHARACTERS); }
function counter(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function member(value: unknown): value is ConversationMember {
  return record(value) && [value.id, value.sessionId, value.username, value.displayName, value.characterId, value.mediaIdentity].every(text) && value.id === value.username;
}
export function isConversation(value: unknown): value is Conversation {
  if (!record(value) || !text(value.id) || !["meeting", "private", "proximity"].includes(String(value.kind))) return false;
  if (!record(value.mediaTarget) || !text(value.mediaTarget.id) || !counter(value.mediaTarget.generation)) return false;
  if (value.mediaTarget.available !== undefined && typeof value.mediaTarget.available !== "boolean") return false;
  if (!Array.isArray(value.members) || value.members.length === 0 || value.members.length > CONVERSATION_MEMBERS_MAX_COUNT || !value.members.every(member)) return false;
  return new Set(value.members.map(person => person.id)).size === value.members.length && new Set(value.members.map(person => person.sessionId)).size === value.members.length
    && new Set(value.members.map(person => person.mediaIdentity)).size === value.members.length;
}
export function isConversationSnapshot(value: unknown): value is ConversationSnapshot {
  return record(value) && text(value.officeId) && text(value.roomIncarnationId) && counter(value.revision) && (value.admissionLeaseId === undefined || text(value.admissionLeaseId)) && (value.conversation === null || isConversation(value.conversation));
}
export function isConversationSnapshotRequest(value: unknown): value is Record<string, never> { return record(value) && Object.keys(value).length === 0; }
export function isConversationGrantBinding(value: unknown): value is ConversationGrantBinding {
  return record(value) && text(value.conversationId) && counter(value.conversationGeneration) && text(value.roomIncarnationId);
}
export type SpatialMediaTokenRequest = { officeId: string; roomKey?: string; zoneId?: string; mode?: ConversationTokenMode } & Partial<ConversationGrantBinding>;
export function isSpatialMediaTokenRequest(value: unknown): value is SpatialMediaTokenRequest {
  if (!record(value) || !text(value.officeId)) return false;
  if (value.roomKey !== undefined && !text(value.roomKey)) return false;
  if (value.zoneId !== undefined && !text(value.zoneId)) return false;
  if (value.mode !== undefined && !isConversationTokenMode(value.mode)) return false;
  const hasBinding = [value.conversationId, value.conversationGeneration, value.roomIncarnationId].some(field => field !== undefined);
  return !hasBinding || isConversationGrantBinding(value);
}
