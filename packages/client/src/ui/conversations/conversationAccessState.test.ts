import assert from "node:assert/strict";
import test from "node:test";
import { PRIVATE_ZONE_ACCESS_EVENT, PRIVATE_ZONE_RESULT_EVENT, type PrivateZoneAccessSnapshot, type RoomLayout } from "@gammyverse/shared";
import { ConversationAccessState, conversationAccessZones, observeConversationAccess, privateActionEnabled } from "./conversationAccessState";
import type { ConversationTransport } from "../media/conversationState";

const NOW_MS = 1_000;
const EXPIRES_AT_MS = 2_000;
const KNOCK = { id: "knock", username: "requester", sessionId: "requester-session", displayName: "Requester", createdAtMs: NOW_MS, expiresAtMs: EXPIRES_AT_MS, state: "pending" as const };
const SNAPSHOT: PrivateZoneAccessSnapshot = { officeId: "office", roomIncarnationId: "incarnation", zoneId: "zone", revision: 1, locked: true, transportState: "ready", access: "blocked", leaseExpiresAtMs: null,
  capabilities: { lock: false, unlock: false, knock: false, cancelKnock: true, admit: false, revoke: false, retryMedia: false }, ownKnock: KNOCK, pendingKnocks: [], revocableGuests: [] };
const MODERATOR: PrivateZoneAccessSnapshot = { ...SNAPSHOT, access: "admitted", capabilities: { ...SNAPSHOT.capabilities, unlock: true, admit: true, revoke: true }, ownKnock: null, pendingKnocks: [KNOCK],
  revocableGuests: [{ sessionId: "guest", username: "guest", displayName: "Guest", expiresAtMs: EXPIRES_AT_MS }] };
function state(sessionId = KNOCK.sessionId) { return new ConversationAccessState("office", "zone", sessionId, "incarnation"); }
test("access snapshots reject foreign scope, stale revisions and another requester's private status", () => {
  const access = state();
  assert.equal(access.receive(SNAPSHOT), true);
  assert.equal(access.receive({ ...SNAPSHOT, revision: 0, locked: false }), false);
  assert.equal(access.receive({ ...SNAPSHOT, revision: 2, officeId: "other" }), false);
  assert.equal(access.receive({ ...SNAPSHOT, revision: 2, zoneId: "other" }), false);
  assert.equal(access.receive({ ...SNAPSHOT, revision: 2, roomIncarnationId: "other" }), false);
  assert.equal(access.receive({ ...SNAPSHOT, revision: 2, ownKnock: { ...KNOCK, sessionId: "other" } }), false);
  assert.equal(access.snapshot?.locked, true);
});
test("requester projection rejects private queues and guest rosters without moderator capability", () => {
  assert.equal(state().receive({ ...SNAPSHOT, pendingKnocks: [KNOCK] }), false);
  assert.equal(state().receive({ ...SNAPSHOT, revocableGuests: MODERATOR.revocableGuests }), false);
  assert.equal(state("host").receive(MODERATOR), true);
});
test("knock outcomes come only from newer authoritative snapshots including revocation", () => {
  const access = state();
  assert.equal(access.receive(SNAPSHOT), true);
  assert.equal(access.receive({ ...SNAPSHOT, revision: 2, access: "admitted", ownKnock: { ...KNOCK, state: "admitted" }, leaseExpiresAtMs: EXPIRES_AT_MS }), true);
  assert.equal(access.receive({ ...SNAPSHOT, revision: 3, ownKnock: { ...KNOCK, state: "revoked" } }), true);
  assert.equal(access.receive({ ...SNAPSHOT, revision: 2, access: "admitted" }), false);
  assert.equal(access.snapshot?.ownKnock?.state, "revoked");
  assert.equal(access.snapshot?.access, "blocked");
});
test("only supplied capabilities enable moderation and deadline-sensitive actions fail closed", () => {
  assert.equal(privateActionEnabled(SNAPSHOT, { action: "unlock" }, false, NOW_MS), false);
  assert.equal(privateActionEnabled(SNAPSHOT, { action: "admit", knockId: KNOCK.id }, false, NOW_MS), false);
  assert.equal(privateActionEnabled(MODERATOR, { action: "admit", knockId: KNOCK.id }, false, NOW_MS), true);
  assert.equal(privateActionEnabled(MODERATOR, { action: "admit", knockId: "unknown" }, false, NOW_MS), false);
  assert.equal(privateActionEnabled(MODERATOR, { action: "admit", knockId: KNOCK.id }, false, EXPIRES_AT_MS), false);
  assert.equal(privateActionEnabled(MODERATOR, { action: "revoke", targetSessionId: "guest" }, false, NOW_MS), true);
  assert.equal(privateActionEnabled(MODERATOR, { action: "revoke", targetSessionId: "host" }, false, NOW_MS), false);
  assert.equal(privateActionEnabled(MODERATOR, { action: "revoke", targetSessionId: "guest" }, false, EXPIRES_AT_MS), false);
  assert.equal(privateActionEnabled(SNAPSHOT, { action: "cancel-knock" }, false, EXPIRES_AT_MS), false);
  assert.equal(privateActionEnabled(MODERATOR, { action: "unlock" }, true, NOW_MS), false);
});
test("availability is separate from manual admission authority and rotation preserves the scoped state", () => {
  const access = state("host");
  assert.equal(access.receive({ ...MODERATOR, transportState: "rotating" }), true);
  assert.equal(access.snapshot?.transportState, "rotating");
  assert.equal(privateActionEnabled(access.snapshot, { action: "unlock" }, false, NOW_MS), true);
  assert.equal(privateActionEnabled(access.snapshot, { action: "retry-media" }, false, NOW_MS), false);
  assert.equal(privateActionEnabled({ ...MODERATOR, transportState: "unavailable", capabilities: { ...MODERATOR.capabilities, retryMedia: true } }, { action: "retry-media" }, false, NOW_MS), true);
});
test("disposed access observers ignore queued snapshots and command results", () => {
  const callbacks = new Map<string, (payload: unknown) => void>();
  let changes = 0;
  let results = 0;
  const transport: ConversationTransport = { onMessage(event, callback) { callbacks.set(event, callback); return () => {}; }, send() {} };
  const dispose = observeConversationAccess(state(), transport, { snapshotChanged() { changes++; }, resultReceived() { results++; } });
  callbacks.get(PRIVATE_ZONE_ACCESS_EVENT)!(SNAPSHOT);
  callbacks.get(PRIVATE_ZONE_RESULT_EVENT)!({ requestId: "current", ok: true });
  assert.equal(changes, 1);
  assert.equal(results, 1);
  dispose();
  callbacks.get(PRIVATE_ZONE_ACCESS_EVENT)!({ ...SNAPSHOT, revision: 2 });
  callbacks.get(PRIVATE_ZONE_RESULT_EVENT)!({ requestId: "current", ok: false, error: "Late" });
  assert.equal(changes, 1);
  assert.equal(results, 1);
});
test("safe selector exposes only eligible public map IDs and names", () => {
  const geometry = { x: 0, z: 0, width: 4, depth: 4, color: "#fff" };
  const layout: RoomLayout = { version: 1, props: [], walls: [], doors: [], zones: [
    { ...geometry, id: "meeting", name: "Town Hall", kind: "meeting" }, { ...geometry, id: "desk", name: "Desk", kind: "private" },
    { ...geometry, id: "restroom", name: "Restroom", kind: "restroom" },
  ] };
  assert.deepEqual(conversationAccessZones(layout), [{ id: "meeting", name: "Town Hall" }, { id: "desk", name: "Desk" }]);
  assert.deepEqual(conversationAccessZones(null), []);
});
