import assert from "node:assert/strict";
import test from "node:test";
import { CONVERSATION_REQUEST_TIMEOUT_MS, ConversationRequestState } from "./conversationRequest";

const NOW_MS = 1_000;
test("requests serialize and a late acknowledgement cannot complete a newer command", () => {
  const request = new ConversationRequestState();
  assert.equal(request.begin("first", NOW_MS), true);
  assert.equal(request.begin("second", NOW_MS), false);
  assert.equal(request.finish("unrelated"), false);
  assert.equal(request.pending?.requestId, "first");
  assert.equal(request.finish("first"), true);
  assert.equal(request.begin("second", NOW_MS), true);
  assert.equal(request.finish("first"), false);
  assert.equal(request.pending?.requestId, "second");
});
test("each request has a bounded deadline and teardown clears pending ownership", () => {
  const request = new ConversationRequestState();
  request.begin("request", NOW_MS);
  assert.equal(request.pending?.deadlineMs, NOW_MS + CONVERSATION_REQUEST_TIMEOUT_MS);
  request.reset();
  assert.equal(request.pending, null);
  assert.equal(request.finish("request"), false);
});
