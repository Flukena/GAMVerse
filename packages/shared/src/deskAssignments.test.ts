import assert from "node:assert/strict";
import test from "node:test";
import { isOfficeDeskAdministrationSnapshot, isOfficeDeskAssignmentCommand, isOfficeDeskAssignmentResult, isOfficeDesksChanged } from "./desks.js";
import { isDeskAssignmentFenceControl } from "./deskAssignmentFences.js";

const OFFICE_ID = "00000000-0000-4000-8000-000000000001";
const DESK_ID = "00000000-0000-4000-8000-000000000002";
const REQUEST_ID = "00000000-0000-4000-8000-000000000003";
const assign = { requestId: REQUEST_ID, expectedConfigVersion: 1, action: "assign", deskId: DESK_ID, expectedOwnerUsername: null, ownerUsername: "alice" };

test("desk assignment commands require stable identifiers, exact owner/version CAS and no implicit displacement", () => {
  assert.equal(isOfficeDeskAssignmentCommand(assign), true);
  assert.equal(isOfficeDeskAssignmentCommand({ ...assign, expectedOwnerUsername: "bob" }), false);
  assert.equal(isOfficeDeskAssignmentCommand({ ...assign, expectedConfigVersion: 0 }), false);
  assert.equal(isOfficeDeskAssignmentCommand({ ...assign, expectedConfigVersion: Number.MAX_SAFE_INTEGER + 1 }), false);
  assert.equal(isOfficeDeskAssignmentCommand({ ...assign, ownerUsername: " Alice " }), false);
  assert.equal(isOfficeDeskAssignmentCommand({ ...assign, actorUsername: "admin" }), false);
  assert.equal(isOfficeDeskAssignmentCommand({ ...assign, deskId: "zone-name" }), false);
  assert.equal(isOfficeDeskAssignmentCommand({ requestId: REQUEST_ID, expectedConfigVersion: 1, action: "move", sourceDeskId: DESK_ID, targetDeskId: DESK_ID, expectedSourceOwnerUsername: "alice", expectedTargetOwnerUsername: null }), false);
});

test("admin snapshots contain canonical labels and committed pending result is distinguished from rollback", () => {
  const snapshot = { officeId: OFFICE_ID, configVersion: 1, realtimeSync: "applied", desks: [{ id: DESK_ID, officeId: OFFICE_ID, zoneId: "zone", ownerUsername: null, name: "Window Desk" }], members: [{ username: "alice", displayName: "Alice" }] };
  assert.equal(isOfficeDeskAdministrationSnapshot(snapshot), true);
  assert.equal(isOfficeDeskAdministrationSnapshot({ ...snapshot, realtimeSync: ["applied"] }), false);
  assert.equal(isOfficeDeskAdministrationSnapshot({ ...snapshot, realtimeSync: { value: "pending" } }), false);
  assert.equal(isOfficeDeskAdministrationSnapshot({ ...snapshot, members: [...snapshot.members, ...snapshot.members] }), false);
  assert.equal(isOfficeDeskAdministrationSnapshot({ ...snapshot, desks: [{ ...snapshot.desks[0], name: "" }] }), false);
  const result = { ...snapshot, config: {}, requestId: REQUEST_ID, persisted: true, realtimeSync: "pending" };
  assert.equal(isOfficeDeskAssignmentResult(result), true);
  assert.equal(isOfficeDeskAssignmentResult({ ...result, persisted: false }), false);
  assert.equal(isOfficeDeskAssignmentResult({ ...result, realtimeSync: "maybe" }), false);
  assert.equal(isOfficeDesksChanged({ officeId: OFFICE_ID, configVersion: 2 }), true);
});

test("internal fence controls bind one operation, next map version and bounded affected zones", () => {
  const fence = { action: "prepare", officeId: OFFICE_ID, operationId: REQUEST_ID, expectedConfigVersion: 1, newConfigVersion: 2, zoneIds: ["zone"], deadlineAtMs: 100_000 };
  assert.equal(isDeskAssignmentFenceControl(fence), true);
  assert.equal(isDeskAssignmentFenceControl({ ...fence, newConfigVersion: 3 }), false);
  assert.equal(isDeskAssignmentFenceControl({ ...fence, zoneIds: ["zone", "zone"] }), false);
  assert.equal(isDeskAssignmentFenceControl({ ...fence, action: "unlock" }), false);
});
