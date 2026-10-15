import assert from "node:assert/strict";
import test from "node:test";
import { isMeetActionCommand, isMeetCreateCommand, isMeetOfferSnapshot, isMeetSyncCommand } from "./meetOffers.js";
const CREATE = { requestId: "request-1", kind: "meet", targetSessionId: "bob-session" };
const PARTY = { username: "alice", sessionId: "alice-session", displayName: "Alice" };
const OFFER = { id: "offer-1", officeId: "office-1", roomIncarnationId: "room-1", kind: "meet", from: PARTY, to: { ...PARTY, username: "bob", sessionId: "bob-session" }, expiresAtMs: 100_000, state: "pending", revision: 1 };
test("meet commands accept intent and reject coordinates, identity and unbounded payloads", () => {
  assert.equal(isMeetCreateCommand(CREATE), true);
  for (const value of [{ ...CREATE, x: 1 }, { ...CREATE, username: "victim" }, { ...CREATE, requestId: "x".repeat(65) }, { ...CREATE, kind: "teleport" }]) assert.equal(isMeetCreateCommand(value), false);
  assert.equal(isMeetActionCommand({ requestId: "action", offerId: OFFER.id, expectedRevision: 1, action: "accept" }), true);
  assert.equal(isMeetActionCommand({ requestId: "action", offerId: OFFER.id, expectedRevision: 0, action: "accept" }), false);
  assert.equal(isMeetSyncCommand({}), true); assert.equal(isMeetSyncCommand({ targetSessionId: "victim" }), false);
});
test("snapshots require matching office/incarnation and monotonic snapshot/offer revisions", () => {
  const snapshot = { officeId: "office-1", roomIncarnationId: "room-1", revision: 1, offers: [OFFER] };
  assert.equal(isMeetOfferSnapshot(snapshot), true);
  assert.equal(isMeetOfferSnapshot({ ...snapshot, revision: undefined }), false);
  assert.equal(isMeetOfferSnapshot({ ...snapshot, offers: [{ ...OFFER, roomIncarnationId: "old-room" }] }), false);
  assert.equal(isMeetOfferSnapshot({ ...snapshot, offers: [OFFER, OFFER] }), false);
});
