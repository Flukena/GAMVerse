import { CONVERSATION_MEMBERS_MAX_COUNT } from "./conversation.js";
import { conversationRecord, conversationText } from "./conversationValidation.js";

export const MEETING_HANDS_SNAPSHOT_EVENT = "meeting-hands";
export const MEETING_HANDS_REQUEST_EVENT = "meeting-hands-request";
export const MEETING_HAND_COMMAND_EVENT = "meeting-hand-command";
export const MEETING_HAND_RESULT_EVENT = "meeting-hand-result";
const MEETING_HAND_FIELD_MAX_CHARACTERS = 512;
const REQUEST_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MeetingHandContext = {
  officeId: string;
  roomIncarnationId: string;
  conversationId: string;
};
export type MeetingHandEntry = { memberId: string; sessionId: string; orderSequence: number };
export type MeetingHandsSnapshot = MeetingHandContext & { revision: number; entries: MeetingHandEntry[] };
export type MeetingHandsRequest = MeetingHandContext & { requestId: string };
export type MeetingHandCommand = MeetingHandsRequest & { raised: boolean };
export type MeetingHandResult = MeetingHandsRequest & { ok: boolean; error?: string };

function text(value: unknown): value is string {
  return conversationText(value, MEETING_HAND_FIELD_MAX_CHARACTERS);
}
function counter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function context(value: unknown): value is MeetingHandContext & Record<string, unknown> {
  return conversationRecord(value) && text(value.officeId) && text(value.roomIncarnationId) && text(value.conversationId);
}
function entry(value: unknown): value is MeetingHandEntry {
  return conversationRecord(value) && text(value.memberId) && text(value.sessionId) && counter(value.orderSequence) && value.orderSequence > 0;
}
function validEntries(entries: unknown): entries is MeetingHandEntry[] {
  if (!Array.isArray(entries) || entries.length > CONVERSATION_MEMBERS_MAX_COUNT || !entries.every(entry)) return false;
  const members = new Set<string>();
  const sessions = new Set<string>();
  let previousSequence = 0;
  for (const item of entries) {
    if (members.has(item.memberId) || sessions.has(item.sessionId) || item.orderSequence <= previousSequence) return false;
    members.add(item.memberId);
    sessions.add(item.sessionId);
    previousSequence = item.orderSequence;
  }
  return true;
}
export function isMeetingHandsSnapshot(value: unknown): value is MeetingHandsSnapshot {
  return context(value) && counter(value.revision) && validEntries(value.entries);
}
export function isMeetingHandsRequest(value: unknown): value is MeetingHandsRequest {
  return context(value) && typeof value.requestId === "string" && REQUEST_UUID_PATTERN.test(value.requestId);
}
export function isMeetingHandCommand(value: unknown): value is MeetingHandCommand {
  return conversationRecord(value) && typeof value.raised === "boolean" && isMeetingHandsRequest(value);
}
export function isMeetingHandResult(value: unknown): value is MeetingHandResult {
  return conversationRecord(value) && typeof value.ok === "boolean" && (value.error === undefined || text(value.error)) && isMeetingHandsRequest(value);
}
