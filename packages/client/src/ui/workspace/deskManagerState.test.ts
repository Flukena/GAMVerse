import assert from "node:assert/strict";
import test from "node:test";
import type { OfficeDeskAdministrationSnapshot } from "@gammyverse/shared";
import { deskAssignmentCommand, deskManagerMembers, deskManagerRows, vacantDeskIntent } from "./deskManagerState";

const OFFICE_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const SNAPSHOT: OfficeDeskAdministrationSnapshot = { officeId: OFFICE_ID, configVersion: 7, realtimeSync: "applied", desks: [
  { id: SOURCE_ID, officeId: OFFICE_ID, zoneId: "source", name: "Design desk", ownerUsername: "alex" },
  { id: TARGET_ID, officeId: OFFICE_ID, zoneId: "target", name: "Library desk", ownerUsername: null },
], members: [{ username: "alex", displayName: "Alex Lee" }, { username: "offline.member", displayName: "Offline Member" }] };
test("assignment requires a vacant desk and an eligible member without another desk", () => {
  assert.deepEqual(deskAssignmentCommand(SNAPSHOT, { action: "assign", deskId: TARGET_ID, ownerUsername: "offline.member" }, REQUEST_ID), {
    action: "assign", deskId: TARGET_ID, ownerUsername: "offline.member", expectedOwnerUsername: null, requestId: REQUEST_ID, expectedConfigVersion: 7,
  });
  assert.equal(deskAssignmentCommand(SNAPSHOT, { action: "assign", deskId: TARGET_ID, ownerUsername: "alex" }, REQUEST_ID), null);
  assert.equal(deskAssignmentCommand(SNAPSHOT, { action: "assign", deskId: SOURCE_ID, ownerUsername: "offline.member" }, REQUEST_ID), null);
  assert.equal(deskAssignmentCommand(SNAPSHOT, { action: "assign", deskId: TARGET_ID, ownerUsername: "removed" }, REQUEST_ID), null);
});
test("moving is explicit and atomically guards the exact source owner and vacant destination", () => {
  const intent = vacantDeskIntent(SNAPSHOT, TARGET_ID, "alex");
  assert.deepEqual(intent, { action: "move", sourceDeskId: SOURCE_ID, targetDeskId: TARGET_ID });
  assert.ok(intent);
  assert.deepEqual(deskAssignmentCommand(SNAPSHOT, intent, REQUEST_ID), {
    action: "move", sourceDeskId: SOURCE_ID, targetDeskId: TARGET_ID, expectedSourceOwnerUsername: "alex", expectedTargetOwnerUsername: null, requestId: REQUEST_ID, expectedConfigVersion: 7,
  });
  assert.equal(deskAssignmentCommand(SNAPSHOT, { action: "move", sourceDeskId: SOURCE_ID, targetDeskId: SOURCE_ID }, REQUEST_ID), null);
});
test("unassignment uses the observed current owner and cannot target a vacant desk", () => {
  assert.deepEqual(deskAssignmentCommand(SNAPSHOT, { action: "unassign", deskId: SOURCE_ID }, REQUEST_ID), {
    action: "unassign", deskId: SOURCE_ID, expectedOwnerUsername: "alex", requestId: REQUEST_ID, expectedConfigVersion: 7,
  });
  assert.equal(deskAssignmentCommand(SNAPSHOT, { action: "unassign", deskId: TARGET_ID }, REQUEST_ID), null);
});
test("human room names, owner names and offline member identities are searchable", () => {
  assert.deepEqual(deskManagerRows(SNAPSHOT, " library ").map(desk => desk.id), [TARGET_ID]);
  assert.deepEqual(deskManagerRows(SNAPSHOT, "LEE").map(desk => desk.id), [SOURCE_ID]);
  assert.deepEqual(deskManagerMembers(SNAPSHOT, "OFFLINE.").map(member => member.username), ["offline.member"]);
  assert.deepEqual(deskManagerRows(SNAPSHOT, "missing"), []);
});
