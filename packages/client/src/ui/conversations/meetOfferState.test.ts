import assert from "node:assert/strict";
import test from "node:test";
import type { MeetOffer, MeetOfferSnapshot } from "@gammyverse/shared";
import { MeetOfferState, meetOfferActions } from "./meetOfferState";

const NOW_MS = 1_000;
const OFFER: MeetOffer = { id: "offer", officeId: "office", roomIncarnationId: "incarnation", kind: "meet", from: { sessionId: "sender", username: "alex", displayName: "Alex" },
  to: { sessionId: "recipient", username: "sam", displayName: "Sam" }, expiresAtMs: 2_000, state: "pending", revision: 1 };
const SNAPSHOT: MeetOfferSnapshot = { officeId: "office", roomIncarnationId: "incarnation", revision: 1, offers: [OFFER] };
test("offers reject foreign context, unrelated recipients and stale whole snapshots", () => {
  const state = new MeetOfferState("office", "recipient");
  assert.equal(state.receive(SNAPSHOT), true);
  assert.equal(state.receive({ ...SNAPSHOT, revision: 0, offers: [] }), false);
  assert.equal(state.receive({ ...SNAPSHOT, revision: 2, officeId: "other" }), false);
  assert.equal(state.receive({ ...SNAPSHOT, revision: 2, roomIncarnationId: "old" }), false);
  assert.equal(new MeetOfferState("office", "outsider").receive(SNAPSHOT), false);
  assert.equal(state.snapshot?.offers[0]?.state, "pending");
});
test("terminal offers cannot regress through an older offer revision", () => {
  const state = new MeetOfferState("office", "recipient");
  assert.equal(state.receive({ ...SNAPSHOT, revision: 2, offers: [{ ...OFFER, state: "accepted", revision: 2 }] }), true);
  assert.equal(state.receive({ ...SNAPSHOT, revision: 3 }), false);
  assert.equal(state.snapshot?.offers[0]?.state, "accepted");
});
test("recipient can accept or decline; sender can only cancel and stale actions are disabled", () => {
  assert.deepEqual(meetOfferActions(OFFER, "recipient", "available", NOW_MS, false).map(action => [action.action, action.disabled]), [["accept", false], ["decline", false]]);
  assert.deepEqual(meetOfferActions(OFFER, "sender", "available", NOW_MS, false).map(action => action.action), ["cancel"]);
  assert.deepEqual(meetOfferActions(OFFER, "outsider", "available", NOW_MS, false), []);
  assert.ok(meetOfferActions(OFFER, "recipient", "available", OFFER.expiresAtMs, false).every(action => action.disabled));
  assert.ok(meetOfferActions({ ...OFFER, state: "accepted" }, "recipient", "available", NOW_MS, false).every(action => action.disabled));
});
test("Busy blocks acceptance visibly while leaving decline and cancel available", () => {
  const incoming = meetOfferActions(OFFER, "recipient", "do-not-disturb", NOW_MS, false);
  assert.equal(incoming.find(action => action.action === "accept")?.disabled, true);
  assert.ok(incoming.find(action => action.action === "accept")?.disabledReason);
  assert.equal(incoming.find(action => action.action === "decline")?.disabled, false);
  assert.equal(meetOfferActions(OFFER, "sender", "away", NOW_MS, false)[0]?.disabled, false);
  assert.ok(meetOfferActions(OFFER, "recipient", "available", NOW_MS, true).every(action => action.disabled));
});
