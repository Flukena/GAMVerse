import assert from "node:assert/strict";
import test from "node:test";
import { OFFICE_DESKS_CHANGED_EVENT, type OfficeDesk } from "@gammyverse/shared";
import { DeskAssignmentNoticeState, observeDeskAssignmentChanges } from "./deskAssignmentNotice";
import type { ConversationTransport } from "../media/conversationState";

const OFFICE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_OFFICE_ID = "55555555-5555-4555-8555-555555555555";
const FIRST_DESK: OfficeDesk = { id: "22222222-2222-4222-8222-222222222222", officeId: OFFICE_ID, zoneId: "first", ownerUsername: null };
const SECOND_DESK: OfficeDesk = { id: "33333333-3333-4333-8333-333333333333", officeId: OFFICE_ID, zoneId: "second", ownerUsername: null };
const CONTEXT = { officeId: OFFICE_ID, username: "alex", sessionKey: "session" };
const OWN_FIRST = [{ ...FIRST_DESK, ownerUsername: "alex" }, SECOND_DESK];
const OWN_SECOND = [FIRST_DESK, { ...SECOND_DESK, ownerUsername: "alex" }];
test("initial join and unrelated members' assignments do not produce a personal notice", () => {
  const state = new DeskAssignmentNoticeState(CONTEXT);
  state.observe(OWN_FIRST, 1);
  assert.equal(state.notice, null);
  state.observe([OWN_FIRST[0]!, { ...SECOND_DESK, ownerUsername: "sam" }], 2);
  assert.equal(state.notice, null);
});
test("a versioned event waits for the matching canonical refresh before announcing an assignment", () => {
  const state = new DeskAssignmentNoticeState(CONTEXT);
  state.observe([FIRST_DESK, SECOND_DESK], 1);
  state.receiveEvent({ officeId: OFFICE_ID, configVersion: 3 });
  state.observe(OWN_FIRST, 2);
  assert.equal(state.notice, null);
  state.observe(OWN_FIRST, 3);
  assert.match(state.notice ?? "", /assignment changed/);
  state.dismiss();
  assert.equal(state.notice, null);
  assert.equal(state.receiveEvent({ officeId: OFFICE_ID, configVersion: 3 }), false);
  assert.equal(state.notice, null);
});
test("canonical refresh before the event preserves the previous ownership transition", () => {
  const state = new DeskAssignmentNoticeState(CONTEXT);
  state.observe(OWN_FIRST, 1);
  state.observe(OWN_SECOND, 2);
  assert.equal(state.notice, null);
  state.receiveEvent({ officeId: OFFICE_ID, configVersion: 2 });
  assert.match(state.notice ?? "", /assignment changed/);
  state.receiveEvent({ officeId: OFFICE_ID, configVersion: 3 });
  state.observe([FIRST_DESK, SECOND_DESK], 3);
  assert.match(state.notice ?? "", /assignment changed/);
});
test("foreign offices and stale snapshots/events cannot replace current notification state", () => {
  const state = new DeskAssignmentNoticeState(CONTEXT);
  state.observe(OWN_FIRST, 2);
  assert.equal(state.receiveEvent({ officeId: OTHER_OFFICE_ID, configVersion: 3 }), false);
  state.observe(OWN_SECOND, 1);
  assert.equal(state.receiveEvent({ officeId: OFFICE_ID, configVersion: 0 }), false);
  state.observe(OWN_FIRST, 3);
  assert.equal(state.notice, null);
});
test("disconnected observer callbacks cannot trigger refreshes or late notices", () => {
  let callback: (payload: unknown) => void = () => {};
  let refreshes = 0;
  let changes = 0;
  const transport: ConversationTransport = { onMessage(event, listener) { assert.equal(event, OFFICE_DESKS_CHANGED_EVENT); callback = listener; return () => {}; }, send() {} };
  const state = new DeskAssignmentNoticeState(CONTEXT);
  const dispose = observeDeskAssignmentChanges(state, transport, { changed() { changes++; }, refresh() { refreshes++; } });
  callback({ officeId: OFFICE_ID, configVersion: 2 });
  assert.equal(refreshes, 1);
  assert.equal(changes, 1);
  dispose();
  callback({ officeId: OFFICE_ID, configVersion: 3 });
  assert.equal(refreshes, 1);
  assert.equal(changes, 1);
});

test("a canonical refresh newer than the assignment event still announces an observed ownership change", () => {
  const state = new DeskAssignmentNoticeState(CONTEXT);
  state.observe(OWN_FIRST, 1);
  state.receiveEvent({ officeId: OFFICE_ID, configVersion: 2 });
  state.observe(OWN_SECOND, 3);
  assert.match(state.notice ?? "", /assignment changed/);
});

test("targeted assignment events stay truthful when coalesced changes restore the original desk", () => {
  const state = new DeskAssignmentNoticeState(CONTEXT);
  state.observe(OWN_FIRST, 1);
  state.receiveEvent({ officeId: OFFICE_ID, configVersion: 2 });
  state.observe(OWN_FIRST, 3);
  assert.match(state.notice ?? "", /assignment changed/);
});
