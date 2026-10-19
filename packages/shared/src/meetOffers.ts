import { isValidStatusRequestId } from "./availability.js";

export const MEET_OFFER_KINDS = ["meet", "join-me"] as const;
export const MEET_OFFER_STATES = ["pending", "accepted", "declined", "cancelled", "expired", "unavailable"] as const;
export type MeetOfferKind = typeof MEET_OFFER_KINDS[number];
export type MeetOfferState = typeof MEET_OFFER_STATES[number];
export type MeetParty = { username: string; sessionId: string; displayName: string };
export type MeetOffer = { id: string; officeId: string; roomIncarnationId: string; kind: MeetOfferKind; from: MeetParty; to: MeetParty; expiresAtMs: number; state: MeetOfferState; revision: number };
export type MeetOfferSnapshot = { officeId: string; roomIncarnationId: string; revision: number; offers: MeetOffer[]; requestId?: string };
export type MeetOfferError = { requestId: string; error: string };
export type MeetCreateCommand = { requestId: string; kind: MeetOfferKind; targetSessionId: string };
export type MeetActionCommand = { requestId: string; offerId: string; expectedRevision: number; action: "accept" | "decline" | "cancel" };
export const MEET_OFFER_TTL_MS = 30_000;
const MAX_IDENTIFIER_CHARACTERS = 128;
const MAX_DISPLAY_NAME_CODE_POINTS = 64;
const MAX_ERROR_CHARACTERS = 256;
const MAX_SNAPSHOT_OFFERS_COUNT = 261;
const INITIAL_OFFER_REVISION_COUNT = 1;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function identifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= MAX_IDENTIFIER_CHARACTERS && /^[A-Za-z0-9_-]+$/.test(value); }
function boundedText(value: unknown, limit: number): value is string { return typeof value === "string" && value.length > 0 && [...value].length <= limit && !CONTROL_CHARACTERS.test(value); }
function party(value: unknown): value is MeetParty {
  return record(value) && boundedText(value.username, MAX_DISPLAY_NAME_CODE_POINTS) && identifier(value.sessionId) && boundedText(value.displayName, MAX_DISPLAY_NAME_CODE_POINTS);
}
export function isMeetCreateCommand(value: unknown): value is MeetCreateCommand {
  return record(value) && Object.keys(value).length === 3 && isValidStatusRequestId(value.requestId) && MEET_OFFER_KINDS.some(kind => kind === value.kind) && identifier(value.targetSessionId);
}
export function isMeetActionCommand(value: unknown): value is MeetActionCommand {
  return record(value) && Object.keys(value).length === 4 && isValidStatusRequestId(value.requestId) && identifier(value.offerId)
    && Number.isSafeInteger(value.expectedRevision) && Number(value.expectedRevision) >= INITIAL_OFFER_REVISION_COUNT
    && ["accept", "decline", "cancel"].some(action => action === value.action);
}
export function isMeetSyncCommand(value: unknown): value is Record<string, never> { return record(value) && Object.keys(value).length === 0; }
export function isMeetOffer(value: unknown): value is MeetOffer {
  if (!record(value)) return false;
  return identifier(value.id) && identifier(value.officeId) && identifier(value.roomIncarnationId)
    && MEET_OFFER_KINDS.some(kind => kind === value.kind) && party(value.from) && party(value.to)
    && Number.isSafeInteger(value.expiresAtMs) && Number(value.expiresAtMs) > 0
    && MEET_OFFER_STATES.some(state => state === value.state) && Number.isSafeInteger(value.revision) && Number(value.revision) >= INITIAL_OFFER_REVISION_COUNT;
}
export function isMeetOfferSnapshot(value: unknown): value is MeetOfferSnapshot {
  if (!record(value) || !identifier(value.officeId) || !identifier(value.roomIncarnationId) || !Array.isArray(value.offers) || value.offers.length > MAX_SNAPSHOT_OFFERS_COUNT) return false;
  return Number.isSafeInteger(value.revision) && Number(value.revision) >= INITIAL_OFFER_REVISION_COUNT
    && (value.requestId === undefined || isValidStatusRequestId(value.requestId)) && value.offers.every(isMeetOffer)
    && value.offers.every(offer => offer.officeId === value.officeId && offer.roomIncarnationId === value.roomIncarnationId)
    && new Set(value.offers.map(offer => offer.id)).size === value.offers.length;
}
export function isMeetOfferError(value: unknown): value is MeetOfferError {
  return record(value) && isValidStatusRequestId(value.requestId) && boundedText(value.error, MAX_ERROR_CHARACTERS);
}
