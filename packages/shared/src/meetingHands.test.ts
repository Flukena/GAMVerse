import assert from "node:assert/strict";
import test from "node:test";
import { CONVERSATION_MEMBERS_MAX_COUNT } from "./conversation.js";
import { isMeetingHandCommand, isMeetingHandResult, isMeetingHandsRequest, isMeetingHandsSnapshot } from "./meetingHands.js";

const context = { officeId: "office", roomIncarnationId: "incarnation", conversationId: "conversation" };
const request = { ...context, requestId: "12345678-1234-4234-8234-123456789abc" };
const entry = { memberId: "alice", sessionId: "alice-session", orderSequence: 1 };

test("hand commands require correlated bounded conversation context and boolean intent", () => {
  assert.equal(isMeetingHandsRequest(request), true);
  assert.equal(isMeetingHandCommand({ ...request, raised: true }), true);
  assert.equal(isMeetingHandCommand({ ...request, raised: "true" }), false);
  assert.equal(isMeetingHandCommand({ ...request, raised: true, conversationId: "" }), false);
  assert.equal(isMeetingHandsRequest({ ...request, requestId: "arbitrary" }), false);
  assert.equal(isMeetingHandsRequest({ ...request, officeId: "x".repeat(513) }), false);
  assert.equal(isMeetingHandResult({ ...request, ok: false, error: "Unavailable" }), true);
  assert.equal(isMeetingHandResult({ ...request, ok: true, error: {} }), false);
});

test("hand snapshots reject duplicate identities, unordered sequences, unsafe counters and overflow", () => {
  const snapshot = { ...context, revision: 0, entries: [entry] };
  assert.equal(isMeetingHandsSnapshot(snapshot), true);
  assert.equal(isMeetingHandsSnapshot({ ...snapshot, entries: [] }), true);
  for (const entries of [
    [entry, { memberId: "bob", sessionId: "bob-session", orderSequence: 1 }],
    [entry, { ...entry, orderSequence: 2 }],
    [entry, { memberId: "bob", sessionId: entry.sessionId, orderSequence: 2 }],
    [{ ...entry, orderSequence: 0 }],
    [{ ...entry, orderSequence: Number.MAX_SAFE_INTEGER + 1 }],
    Array.from({ length: CONVERSATION_MEMBERS_MAX_COUNT + 1 }, (_, index) => ({ memberId: String(index), sessionId: String(index), orderSequence: index + 1 })),
  ]) assert.equal(isMeetingHandsSnapshot({ ...snapshot, entries }), false);
  assert.equal(isMeetingHandsSnapshot({ ...snapshot, revision: -1 }), false);
});
