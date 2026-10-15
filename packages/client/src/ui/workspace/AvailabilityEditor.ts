import { isValidUserStatusCommand, type CustomStatus, type UserStatusCommand, type UserStatus } from "@gammyverse/shared";

const MINUTE_DURATION_MS = 60_000;
const HOUR_DURATION_MS = 60 * MINUTE_DURATION_MS;
export const STATUS_EXPIRY_OPTIONS = [
  { value: "keep", label: "Keep current expiry", durationMs: null },
  { value: "never", label: "Do not clear", durationMs: null },
  { value: "30m", label: "30 minutes", durationMs: 30 * MINUTE_DURATION_MS },
  { value: "1h", label: "1 hour", durationMs: HOUR_DURATION_MS },
  { value: "4h", label: "4 hours", durationMs: 4 * HOUR_DURATION_MS },
  { value: "1d", label: "1 day", durationMs: 24 * HOUR_DURATION_MS },
] as const;
export type StatusExpiryChoice = typeof STATUS_EXPIRY_OPTIONS[number]["value"];
export const STATUS_PRESETS = [
  { text: "Focusing", emoji: "🎯" }, { text: "Taking a break", emoji: "☕" }, { text: "At lunch", emoji: "🍽️" },
] as const;

export function availabilityDraftCommand(status: UserStatus, text: string, emoji: string, expiry: StatusExpiryChoice,
  current: CustomStatus | null, nowMs: number): UserStatusCommand | null {
  const durationMs = STATUS_EXPIRY_OPTIONS.find((option) => option.value === expiry)?.durationMs ?? null;
  const expiresAtMs = expiry === "keep" ? current?.expiresAtMs ?? null : durationMs === null ? null : nowMs + durationMs;
  const customStatus = text.trim() || emoji.trim() ? { text: text.trim(), emoji: emoji.trim(), expiresAtMs } : null;
  const command = { status, customStatus };
  return isValidUserStatusCommand(command, nowMs) ? command : null;
}
