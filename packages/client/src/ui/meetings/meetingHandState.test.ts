import assert from "node:assert/strict";
import test from "node:test";
import { MEETING_HANDS_SNAPSHOT_EVENT, MEETING_HAND_RESULT_EVENT, type ConversationSnapshot, type MeetingHandsSnapshot } from "@gammyverse/shared";
import { MeetingHandState, observeMeetingHands, selectMeetingHands } from "./meetingHandState";
import type { ConversationTransport } from "../media/conversationState";

const HAND_REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const CONTEXT = { officeId: "office", roomIncarnationId: "incarnation", conversationId: "conversation", sessionId: "self-session", transportKey: "transport" };
const QUEUE: MeetingHandsSnapshot = { officeId: CONTEXT.officeId, roomIncarnationId: CONTEXT.roomIncarnationId, conversationId: CONTEXT.conversationId, revision: 1,
  entries: [{ memberId: "zoe", sessionId: "zoe-session", orderSequence: 2 }, { memberId: "self", sessionId: CONTEXT.sessionId, orderSequence: 10 }, { memberId: "alex", sessionId: "alex-session", orderSequence: 17 }] };
const CONVERSATION: ConversationSnapshot = { officeId: CONTEXT.officeId, roomIncarnationId: CONTEXT.roomIncarnationId, revision: 1,
  conversation: { id: CONTEXT.conversationId, kind: "meeting", mediaTarget: { id: "zone", generation: 1 }, members: [
    { id: "self", sessionId: CONTEXT.sessionId, username: "self", displayName: "Sam", characterId: "character", mediaIdentity: "self-media" },
    { id: "alex", sessionId: "alex-session", username: "alex", displayName: "Alex", characterId: "character", mediaIdentity: "alex-media" },
    { id: "zoe", sessionId: "zoe-session", username: "zoe", displayName: "Zoe", characterId: "character", mediaIdentity: "zoe-media" },
  ] } };
test("queue revisions and exact office, room incarnation, conversation and transport scope must match", () => {
  const state = new MeetingHandState(CONTEXT);
  assert.equal(state.receive(QUEUE, CONTEXT.transportKey), true);
  assert.equal(state.receive({ ...QUEUE, revision: 0, entries: [] }, CONTEXT.transportKey), false);
  assert.equal(state.receive({ ...QUEUE, revision: 2, officeId: "other" }, CONTEXT.transportKey), false);
  assert.equal(state.receive({ ...QUEUE, revision: 2, roomIncarnationId: "old" }, CONTEXT.transportKey), false);
  assert.equal(state.receive({ ...QUEUE, revision: 2, conversationId: "other" }, CONTEXT.transportKey), false);
  assert.equal(state.receive({ ...QUEUE, revision: 2 }, "old-transport"), false);
  assert.equal(state.snapshot?.entries.length, QUEUE.entries.length);
});
test("malformed order or duplicate participants cannot enter the queue", () => {
  const state = new MeetingHandState(CONTEXT);
  assert.equal(state.receive({ ...QUEUE, entries: [...QUEUE.entries].reverse() }, CONTEXT.transportKey), false);
  assert.equal(state.receive({ ...QUEUE, entries: [QUEUE.entries[0], { ...QUEUE.entries[0], orderSequence: 3 }] }, CONTEXT.transportKey), false);
  assert.equal(state.receive({ ...QUEUE, entries: [{ ...QUEUE.entries[0], orderSequence: 0 }] }, CONTEXT.transportKey), false);
  assert.equal(state.snapshot, null);
});
test("display positions follow server queue order instead of roster, name or local-time order", () => {
  assert.deepEqual(selectMeetingHands(QUEUE, CONVERSATION, CONTEXT.sessionId).map(entry => [entry.position, entry.displayName, entry.isLocal]), [
    [1, "Zoe", false], [2, "Sam", true], [3, "Alex", false],
  ]);
});
test("lost admission, stale conversation context and replacement sessions cannot expose a queue", () => {
  assert.deepEqual(selectMeetingHands(QUEUE, { ...CONVERSATION, conversation: null }, CONTEXT.sessionId), []);
  assert.deepEqual(selectMeetingHands(QUEUE, CONVERSATION, "replacement-session"), []);
  assert.deepEqual(selectMeetingHands({ ...QUEUE, officeId: "other" }, CONVERSATION, CONTEXT.sessionId), []);
  assert.deepEqual(selectMeetingHands({ ...QUEUE, roomIncarnationId: "old" }, CONVERSATION, CONTEXT.sessionId), []);
  assert.deepEqual(selectMeetingHands({ ...QUEUE, conversationId: "other" }, CONVERSATION, CONTEXT.sessionId), []);
});
test("departed peers disappear and member identity cannot be matched by username alone", () => {
  const current: ConversationSnapshot = { ...CONVERSATION, conversation: { ...CONVERSATION.conversation!, members: CONVERSATION.conversation!.members.filter(member => member.id !== "zoe") } };
  assert.deepEqual(selectMeetingHands(QUEUE, current, CONTEXT.sessionId).map(entry => [entry.position, entry.displayName]), [[2, "Sam"], [3, "Alex"]]);
  const replacementQueue = { ...QUEUE, entries: [{ memberId: "self", sessionId: "replaced-self-session", orderSequence: 1 }] };
  assert.deepEqual(selectMeetingHands(replacementQueue, CONVERSATION, CONTEXT.sessionId), []);
});
test("same conversation preserves queue order through media epoch rotations and media availability changes", () => {
  const rotating: ConversationSnapshot = { ...CONVERSATION, conversation: { ...CONVERSATION.conversation!, mediaTarget: { id: "new-zone-epoch", generation: 2, available: false } } };
  assert.deepEqual(selectMeetingHands(QUEUE, rotating, CONTEXT.sessionId), selectMeetingHands(QUEUE, CONVERSATION, CONTEXT.sessionId));
});
test("command results require the same context before request correlation can settle them", () => {
  const state = new MeetingHandState(CONTEXT);
  const result = { officeId: CONTEXT.officeId, roomIncarnationId: CONTEXT.roomIncarnationId, conversationId: CONTEXT.conversationId, requestId: HAND_REQUEST_ID, ok: true };
  assert.equal(state.acceptsResult(result, CONTEXT.transportKey), true);
  assert.equal(state.acceptsResult({ ...result, requestId: "request" }, CONTEXT.transportKey), false);
  assert.equal(state.acceptsResult({ ...result, conversationId: "old" }, CONTEXT.transportKey), false);
  assert.equal(state.acceptsResult({ ...result, roomIncarnationId: "old" }, CONTEXT.transportKey), false);
  assert.equal(state.acceptsResult(result, "old-transport"), false);
});
test("disposed listeners cannot publish queued old snapshots or command acknowledgements", () => {
  const callbacks = new Map<string, (payload: unknown) => void>();
  let snapshots = 0;
  let results = 0;
  const transport: ConversationTransport = { onMessage(event, callback) { callbacks.set(event, callback); return () => {}; }, send() {} };
  const dispose = observeMeetingHands(new MeetingHandState(CONTEXT), transport, { snapshotChanged() { snapshots++; }, resultReceived() { results++; } });
  const result = { officeId: CONTEXT.officeId, roomIncarnationId: CONTEXT.roomIncarnationId, conversationId: CONTEXT.conversationId, requestId: HAND_REQUEST_ID, ok: true };
  callbacks.get(MEETING_HANDS_SNAPSHOT_EVENT)!(QUEUE);
  callbacks.get(MEETING_HAND_RESULT_EVENT)!({ ...result, requestId: "request" });
  assert.equal(results, 0);
  callbacks.get(MEETING_HAND_RESULT_EVENT)!(result);
  assert.equal(snapshots, 1);
  assert.equal(results, 1);
  dispose();
  callbacks.get(MEETING_HANDS_SNAPSHOT_EVENT)!({ ...QUEUE, revision: 2 });
  callbacks.get(MEETING_HAND_RESULT_EVENT)!(result);
  assert.equal(snapshots, 1);
  assert.equal(results, 1);
});
