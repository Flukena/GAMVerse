/** User intent is separate from transport presence and movement permission. */
export const USER_STATUSES = ["available", "do-not-disturb", "in-meeting", "away", "toilet", "lunch", "coffee-break"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const CUSTOM_STATUS_TEXT_MAX_CODE_POINTS = 80;
export const CUSTOM_STATUS_EMOJI_MAX_CODE_POINTS = 16;
export const CUSTOM_STATUS_MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export type CustomStatus = { text: string; emoji: string; expiresAtMs: number | null };
export type AvailabilityProfile = { status: UserStatus; customStatus: CustomStatus | null };
export type UserStatusCommand = { status: UserStatus; customStatus?: CustomStatus | null; requestId?: string };
export const STATUS_REQUEST_ID_MAX_CHARACTERS = 64;
export function isValidStatusRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length <= STATUS_REQUEST_ID_MAX_CHARACTERS && /^[A-Za-z0-9_-]+$/.test(value);
}
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function availabilityPolicy(status: string) {
  const suppressed = status === "do-not-disturb" || status === "in-meeting" || status === "away";
  return { suppressAutomaticMedia: suppressed, suppressInterruptions: suppressed };
}
function validStatusString(value: unknown, maxCodePoints: number): value is string {
  return typeof value === "string" && [...value].length <= maxCodePoints && !CONTROL_CHARACTERS.test(value);
}
export function isValidCustomStatus(value: unknown, nowMs = Date.now()): value is CustomStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as Record<string, unknown>;
  if (!validStatusString(status.text, CUSTOM_STATUS_TEXT_MAX_CODE_POINTS)
    || !validStatusString(status.emoji, CUSTOM_STATUS_EMOJI_MAX_CODE_POINTS)) return false;
  return status.expiresAtMs === null || (typeof status.expiresAtMs === "number"
    && Number.isSafeInteger(status.expiresAtMs) && status.expiresAtMs > nowMs
    && status.expiresAtMs - nowMs <= CUSTOM_STATUS_MAX_DURATION_MS);
}
export function isValidUserStatusCommand(value: unknown, nowMs = Date.now()): value is UserStatusCommand {
  if (!value || typeof value !== "object") return false;
  const command = value as Record<string, unknown>;
  return typeof command.status === "string" && USER_STATUSES.some(status => status === command.status)
    && (command.requestId === undefined || isValidStatusRequestId(command.requestId))
    && (command.customStatus === undefined || command.customStatus === null || isValidCustomStatus(command.customStatus, nowMs));
}
export function effectiveAvailability(profile: AvailabilityProfile, nowMs = Date.now()): AvailabilityProfile {
  const expiresAtMs = profile.customStatus?.expiresAtMs;
  return expiresAtMs !== null && expiresAtMs !== undefined && expiresAtMs <= nowMs
    ? { ...profile, customStatus: null } : profile;
}
export function defaultAvailability(): AvailabilityProfile { return { status: "available", customStatus: null }; }
