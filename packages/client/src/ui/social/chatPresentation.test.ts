import assert from "node:assert/strict";
import test from "node:test";
import { chatThreads, shouldSendChatOnEnter } from "./chatPresentation";

test("an empty opened DM stays selectable when another conversation is selected", () => {
  assert.deepEqual(chatThreads([], "alice", ["dm:bob", "office", "dm:bob"]), [
    "nearby", "office", "dm:bob",
  ]);
});

test("live and opened DM conversations share one entry", () => {
  assert.deepEqual(chatThreads([
    { scope: "dm", senderUsername: "carol", recipientUsername: "alice" },
    { scope: "dm", senderUsername: "alice", recipientUsername: "bob" },
  ], "alice", ["dm:bob"]), ["nearby", "office", "dm:bob", "dm:carol"]);
});

test("Enter sends while Shift Enter and IME confirmation preserve the draft", () => {
  assert.equal(shouldSendChatOnEnter("Enter", false, false, 13), true);
  assert.equal(shouldSendChatOnEnter("Enter", true, false, 13), false);
  assert.equal(shouldSendChatOnEnter("Enter", false, true, 13), false);
  assert.equal(shouldSendChatOnEnter("Enter", false, false, 229), false);
  assert.equal(shouldSendChatOnEnter("a", false, false, 65), false);
});
