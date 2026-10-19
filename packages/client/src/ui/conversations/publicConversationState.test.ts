import assert from "node:assert/strict";
import test from "node:test";
import { PublicConversationState } from "./publicConversationState";
import type { PublicConversationsSnapshot } from "@gammyverse/shared";

const SNAPSHOT: PublicConversationsSnapshot = { officeId: "office", roomIncarnationId: "incarnation", revision: 1, conversations: [
  { id: "public", kind: "meeting", name: "Office chat", participantNames: ["Alex"], participantCount: 1, location: { x: 1, z: 2 } },
] };
test("discovery rejects stale revisions, foreign offices and previous room incarnations", () => {
  const state = new PublicConversationState("office");
  assert.equal(state.receive(SNAPSHOT), true);
  assert.equal(state.receive({ ...SNAPSHOT, revision: 0, conversations: [] }), false);
  assert.equal(state.receive({ ...SNAPSHOT, officeId: "other", revision: 2 }), false);
  assert.equal(state.receive({ ...SNAPSHOT, roomIncarnationId: "old", revision: 2 }), false);
  assert.equal(state.receive({ ...SNAPSHOT, revision: 2, conversations: [] }), true);
  assert.deepEqual(state.snapshot?.conversations, []);
});
test("malformed public metadata cannot enter discovery state", () => {
  const state = new PublicConversationState("office", "incarnation");
  assert.equal(state.receive({ ...SNAPSHOT, conversations: [{ ...SNAPSHOT.conversations[0], participantCount: -1 }] }), false);
  assert.equal(state.receive({ ...SNAPSHOT, roomIncarnationId: "other" }), false);
  assert.equal(state.snapshot, null);
});
