import { PRIVATE_ADMISSION_TTL_MS, PRIVATE_KNOCK_TTL_MS, type PrivateKnockState, type PrivateTransportState, type PrivateZoneAccessSnapshot } from "@gammyverse/shared";

const MILLISECONDS_PER_SECOND = 1_000;
const MILLISECONDS_PER_MINUTE = 60_000;
export const PRIVATE_ACCESS_POLICY_LABEL = `GAMVerse policy: knock requests expire after ${PRIVATE_KNOCK_TTL_MS / MILLISECONDS_PER_SECOND} seconds. Admitted guest access lasts ${PRIVATE_ADMISSION_TTL_MS / MILLISECONDS_PER_MINUTE} minutes.`;
export const PRIVATE_KNOCK_STATE_LABELS: Record<PrivateKnockState, string> = {
  pending: "Waiting for admission", admitted: "Your knock was admitted", declined: "Your knock was declined", cancelled: "Your knock was cancelled",
  expired: "Your request or guest access expired. You can knock again when available.", unavailable: "This room could not accept your knock. Please refresh and try again.",
  revoked: "Your guest access was revoked. Room audio and chat are no longer available.",
};
export function remainingAccessTime(expiresAtMs: number, nowMs: number, kind: "knock" | "guest"): string {
  const maximumDurationMs = kind === "knock" ? PRIVATE_KNOCK_TTL_MS : PRIVATE_ADMISSION_TTL_MS;
  const remainingMs = Math.max(0, Math.min(maximumDurationMs, expiresAtMs - nowMs));
  if (remainingMs >= MILLISECONDS_PER_MINUTE) return `${Math.ceil(remainingMs / MILLISECONDS_PER_MINUTE)} minutes remaining`;
  return `${Math.ceil(remainingMs / MILLISECONDS_PER_SECOND)} seconds remaining`;
}

const ADMITTED_CONNECTING_LABEL = "Admitted. Private audio is reconnecting.";
const ADMITTED_UNAVAILABLE_LABEL = "Admitted. Private audio is unavailable. An authorized occupant can retry.";
export function admittedTransportNotice(access: PrivateZoneAccessSnapshot["access"], transportState: PrivateTransportState): string | null {
  if (access !== "admitted" || transportState === "ready") return null;
  return transportState === "rotating" ? ADMITTED_CONNECTING_LABEL : ADMITTED_UNAVAILABLE_LABEL;
}
