import { conversationRecord, conversationText } from "./conversationValidation.js";
import { isValidStatusRequestId } from "./availability.js";
export const PRIVATE_ZONE_ACCESS_EVENT = "private-zone-access";
export const PRIVATE_ZONE_ACCESS_REQUEST_EVENT = "private-zone-access-request";
export const PRIVATE_ZONE_COMMAND_EVENT = "private-zone-command";
export const PRIVATE_ZONE_RESULT_EVENT = "private-zone-result";
export const PRIVATE_KNOCK_TTL_MS = 30000;
export const PRIVATE_ADMISSION_TTL_MS = 10 * 60000;
export const PRIVATE_ACTION_INTERVAL_MS = 1000;
export const PRIVATE_MEDIA_RETRY_INTERVAL_MS = 5000;
export const PRIVATE_PENDING_KNOCKS_MAX_COUNT = 4;
export const PRIVATE_TERMINAL_KNOCKS_MAX_COUNT = 256;
const PRIVATE_FIELD_MAX_CHARACTERS = 512;
export type PrivateTransportState = "ready" | "rotating" | "unavailable";
export type PrivateKnockState = "pending" | "admitted" | "declined" | "cancelled" | "expired" | "revoked" | "unavailable";
export type PrivateKnock = {
  id: string;
  username: string;
  sessionId: string;
  displayName: string;
  createdAtMs: number;
  expiresAtMs: number;
  state: PrivateKnockState;
};
export type PrivateGuest = {
  sessionId: string;
  username: string;
  displayName: string;
  expiresAtMs: number;
};
export type PrivateCapabilities = {
  lock: boolean;
  unlock: boolean;
  knock: boolean;
  cancelKnock: boolean;
  admit: boolean;
  revoke: boolean;
  retryMedia: boolean;
};
export type PrivateZoneAccessSnapshot = {
  officeId: string;
  roomIncarnationId: string;
  zoneId: string;
  revision: number;
  locked: boolean;
  transportState: PrivateTransportState;
  access: "open" | "admitted" | "blocked";
  leaseExpiresAtMs: number | null;
  capabilities: PrivateCapabilities;
  ownKnock: PrivateKnock | null;
  pendingKnocks: PrivateKnock[];
  revocableGuests: PrivateGuest[];
};
export type PrivateZoneAccessRequest = {
  zoneId: string;
  requestId: string;
};
type BaseCommand = {
  requestId: string;
  zoneId: string;
  expectedRevision: number;
};
export type PrivateZoneCommand = BaseCommand & ({
  action: "lock" | "unlock" | "knock" | "cancel-knock" | "retry-media";
} | {
  action: "admit" | "decline";
  knockId: string;
} | {
  action: "revoke";
  targetSessionId: string;
});
export type PrivateZoneResult = {
  requestId: string;
  ok: boolean;
  error?: string;
};
function text(value: unknown): value is string { return conversationText(value, PRIVATE_FIELD_MAX_CHARACTERS); }
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function keys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every(key => allowed.includes(key)); }
export function isValidPrivateZoneAccessRequest(value: unknown): value is PrivateZoneAccessRequest { return conversationRecord(value) && text(value.zoneId) && isValidStatusRequestId(value.requestId) && keys(value, ["zoneId", "requestId"]); }
export function isValidPrivateZoneCommand(value: unknown): value is PrivateZoneCommand {
  if (!conversationRecord(value) || !text(value.zoneId) || !isValidStatusRequestId(value.requestId) || !count(value.expectedRevision))
    return false;
  const base = ["zoneId", "requestId", "expectedRevision", "action"];
  if (value.action === "admit" || value.action === "decline")
    return text(value.knockId) && keys(value, [...base, "knockId"]);
  if (value.action === "revoke")
    return text(value.targetSessionId) && keys(value, [...base, "targetSessionId"]);
  return ["lock", "unlock", "knock", "cancel-knock", "retry-media"].includes(String(value.action)) && keys(value, base);
}
function knock(value: unknown): value is PrivateKnock {
  return conversationRecord(value) && [value.id, value.username, value.sessionId, value.displayName].every(text) && count(value.createdAtMs) && count(value.expiresAtMs) && value.expiresAtMs > value.createdAtMs && ["pending", "admitted", "declined", "cancelled", "expired", "revoked", "unavailable"].includes(String(value.state));
}
function guest(value: unknown): value is PrivateGuest { return conversationRecord(value) && [value.sessionId, value.username, value.displayName].every(text) && count(value.expiresAtMs); }
function capabilities(value: unknown): value is PrivateCapabilities {
  return conversationRecord(value) && ["lock", "unlock", "knock", "cancelKnock", "admit", "revoke", "retryMedia"].every(key => typeof value[key] === "boolean");
}
export function isValidPrivateZoneAccessSnapshot(value: unknown): value is PrivateZoneAccessSnapshot {
  if (!conversationRecord(value) || ![value.officeId, value.roomIncarnationId, value.zoneId].every(text) || !count(value.revision) || typeof value.locked !== "boolean")
    return false;
  if (!["ready", "rotating", "unavailable"].includes(String(value.transportState)) || !["open", "admitted", "blocked"].includes(String(value.access)) || !capabilities(value.capabilities))
    return false;
  if (value.leaseExpiresAtMs !== null && !count(value.leaseExpiresAtMs))
    return false;
  return (value.ownKnock === null || knock(value.ownKnock)) && Array.isArray(value.pendingKnocks) && value.pendingKnocks.length <= PRIVATE_PENDING_KNOCKS_MAX_COUNT && value.pendingKnocks.every(knock) && Array.isArray(value.revocableGuests) && value.revocableGuests.length <= PRIVATE_TERMINAL_KNOCKS_MAX_COUNT && value.revocableGuests.every(guest);
}
export function isValidPrivateZoneResult(value: unknown): value is PrivateZoneResult { return conversationRecord(value) && isValidStatusRequestId(value.requestId) && typeof value.ok === "boolean" && (value.error === undefined || text(value.error)); }
export function isValidLegacyZoneLock(value: unknown): value is {
  zoneId: string;
  locked: boolean;
} { return conversationRecord(value) && text(value.zoneId) && typeof value.locked === "boolean" && keys(value, ["zoneId", "locked"]); }
