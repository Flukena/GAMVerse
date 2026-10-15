import assert from "node:assert/strict";
import test from "node:test";
import { isValidReturnToDeskIntent, isOfficeDeskSnapshot, projectDeskOwners } from "./desks.js";
import { readRoomLayout } from "./roomLayout.js";
const DESK_ID = "00000000-0000-4000-8000-000000000001";
const OFFICE_ID = "00000000-0000-4000-8000-000000000002";
test("desk travel accepts only stable desk identity, never client coordinates or identity", () => {
  assert.equal(isValidReturnToDeskIntent({ deskId: DESK_ID }), true);
  for (const value of [{ deskId: "zone" }, { deskId: DESK_ID, x: 10 }, { deskId: DESK_ID, username: "victim" }, null]) assert.equal(isValidReturnToDeskIntent(value), false);
});
test("canonical ownership replaces stale draft owners and clears ownership on missing desks", () => {
  const layout = readRoomLayout({ layout: { zones: [{ id: "desk", kind: "private", name: "Desk", x: 0, z: 0, width: 4, depth: 4, color: "#ffffff", ownerUsername: "forged" }] } });
  const desk = { id: DESK_ID, officeId: OFFICE_ID, zoneId: "desk", ownerUsername: "alice" };
  assert.equal(projectDeskOwners(layout, [desk]).zones[0]?.ownerUsername, "alice");
  assert.equal(projectDeskOwners(layout, []).zones[0]?.ownerUsername, undefined);
});
test("desk snapshot rejects invalid identities, versions, duplicate active zones", () => {
  const desk = { id: DESK_ID, officeId: OFFICE_ID, zoneId: "desk", ownerUsername: null };
  assert.equal(isOfficeDeskSnapshot({ configVersion: 1, desks: [desk] }), true);
  assert.equal(isOfficeDeskSnapshot({ configVersion: 0, desks: [desk] }), false);
  assert.equal(isOfficeDeskSnapshot({ configVersion: 1, desks: [desk, { ...desk, id: OFFICE_ID }] }), false);
});
