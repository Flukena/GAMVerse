import { normalizeAccountUsername } from "@gammyverse/shared";

export interface ChatThreadMessage {
  scope: "nearby" | "office" | "dm";
  senderUsername: string;
  recipientUsername?: string;
}
export function chatThreadKey(
  message: ChatThreadMessage,
  username: string,
): string {
  if (message.scope !== "dm") return message.scope;
  return `dm:${message.senderUsername === username ? message.recipientUsername : message.senderUsername}`;
}
export function appendChatMessage<T extends { id: string }>(
  messages: readonly T[],
  message: T,
): T[] {
  return messages.some((existing) => existing.id === message.id)
    ? [...messages]
    : [...messages, message];
}
export function spotlightAudioVolume(
  doNotDisturb: boolean,
  hasZoneAudio: boolean,
): number {
  return doNotDisturb || hasZoneAudio ? 0 : 1;
}
export function mediaTileKey(
  roomName: string,
  identity: string,
  source: string,
): string {
  return JSON.stringify([roomName, identity, source]);
}
export function canPublishSpotlight(
  consentedEpoch: string | null,
  currentEpoch: string,
  spotlighted: boolean,
): boolean {
  return spotlighted && consentedEpoch !== null && currentEpoch !== "";
}

export function shouldConnectSpotlight(
  epoch: string,
  usernames: readonly string[],
  paused: boolean,
): boolean {
  return !paused && epoch !== "" && usernames.length > 0;
}
/** Effect dependency: identity of the spotlight connection target. */
export function spotlightSessionKey(
  epoch: string,
  usernames: readonly string[],
  paused: boolean,
): string | null {
  return shouldConnectSpotlight(epoch, usernames, paused) ? epoch : null;
}
export function dmThreadForUsername(value: string): string | null {
  const username = normalizeAccountUsername(value);
  return username ? `dm:${username}` : null;
}

export function shouldRestoreSpotlightCamera(
  consentedEpoch: string | null,
  currentEpoch: string,
  spotlighted: boolean,
  camera: boolean,
): boolean {
  return (
    camera && canPublishSpotlight(consentedEpoch, currentEpoch, spotlighted)
  );
}

export interface SpotlightConsent {
  epoch: string;
  officeId: string;
  sessionKey: string;
}
export function isSpotlightConsentCurrent(
  consent: SpotlightConsent | null,
  officeId: string,
  sessionKey: string,
): boolean {
  return (
    consent !== null &&
    consent.officeId === officeId &&
    consent.sessionKey === sessionKey
  );
}
export function spotlightAfterRoomChange(
  snapshot: { epoch: string; usernames: string[] },
  previousOfficeId: string | null,
  officeId: string | null,
) {
  return previousOfficeId === officeId
    ? snapshot
    : { epoch: "", usernames: [] };
}
