import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationSnapshot } from "@gammyverse/shared";
import { ConversationState, conversationBindingKey, deriveConversationVoiceTarget, observeConversationTransport, type ConversationTransport } from "./conversationState";
import { voiceTargetKey } from "./voiceTarget";

const context = { officeId: "office", transportKey: "transport", sessionId: "local-session" };
function snapshot(revision = 1): ConversationSnapshot {
  return { officeId: "office", roomIncarnationId: "incarnation", revision,
    conversation: { id: "conversation", kind: "meeting", mediaTarget: { id: "zone", generation: 1 }, members: [
      { id: "person", username: "person", sessionId: "local-session", displayName: "Person", characterId: "avatar", mediaIdentity: "opaque-person" },
    ] } };
}

test("only current validated office, transport and incarnation can replace admission", () => {
  const state = new ConversationState(context);
  assert.equal(state.receive(snapshot(), "old-transport"), false);
  assert.equal(state.receive({ ...snapshot(), officeId: "other-office" }, "transport"), false);
  assert.equal(state.receive({ ...snapshot(), conversation: {} }, "transport"), false);
  assert.equal(state.receive(snapshot(), "transport"), true);
  assert.equal(state.receive(snapshot(), "transport"), false);
  assert.equal(state.receive(snapshot(0), "transport"), false);
  assert.equal(state.receive({ ...snapshot(2), roomIncarnationId: "restarted-room" }, "transport"), false);
  const foreign = snapshot(2);
  foreign.conversation!.members[0].sessionId = "other-session";
  assert.equal(state.receive(foreign, "transport"), false);
  assert.equal(state.snapshot?.revision, 1);
  assert.equal(state.receive({ ...snapshot(2), conversation: null }, "transport"), true);
  assert.equal(state.snapshot?.conversation, null);
});

test("replacement accepts a fresh incarnation only in a new transport state", () => {
  const state = new ConversationState({ ...context, roomIncarnationId: "expected" });
  assert.equal(state.receive(snapshot(), "transport"), false);
  const replacement = new ConversationState({ ...context, transportKey: "new-transport" });
  assert.equal(replacement.receive({ ...snapshot(0), roomIncarnationId: "restarted" }, "new-transport"), true);
});

test("view, roster and profile updates preserve media binding; admission generation replaces it", () => {
  const admission = snapshot();
  const first = deriveConversationVoiceTarget(admission, "session", false);
  assert.equal(first?.id, "zone");
  assert.equal(first?.conversationId, "conversation");
  assert.equal(first?.roomIncarnationId, "incarnation");
  assert.equal(deriveConversationVoiceTarget(admission, "session", true), null);
  assert.equal(deriveConversationVoiceTarget(admission, null, false), null);
  const revised = snapshot(2);
  revised.conversation!.members[0].displayName = "Renamed";
  assert.equal(voiceTargetKey(deriveConversationVoiceTarget(revised, "session", false)), voiceTargetKey(first));
  revised.conversation!.mediaTarget.generation += 1;
  assert.notEqual(conversationBindingKey(revised, "session"), voiceTargetKey(first));
  assert.equal(conversationBindingKey(null, "session"), null);
});

test("transport requests current admission and ignores deferred callbacks after disposal", () => {
  let receive: ((payload: unknown) => void) | undefined;
  let disposed = false;
  const requests: unknown[] = [];
  const room: ConversationTransport = {
    onMessage(type, callback) { assert.equal(type, "conversation-snapshot"); receive = callback; return () => { disposed = true; }; },
    send(type, payload) { requests.push([type, payload]); },
  };
  const updates: ConversationSnapshot[] = [];
  const state = new ConversationState(context);
  const dispose = observeConversationTransport(state, room, value => updates.push(value));
  assert.deepEqual(requests, [["conversation-snapshot-request", {}]]);
  receive?.(snapshot());
  assert.equal(updates.length, 1);
  dispose();
  receive?.(snapshot(2));
  assert.equal(updates.length, 1);
  assert.equal(disposed, true);
});


test("conversation listening mode binds authorization while Off produces no media target", () => {
  const admission = snapshot();
  const listening = deriveConversationVoiceTarget(admission, "session", false, "listen");
  const joining = deriveConversationVoiceTarget(admission, "session", false, "join");
  assert.equal(listening?.mode, "listen");
  assert.equal(joining?.mode, "join");
  assert.notEqual(voiceTargetKey(listening), voiceTargetKey(joining));
  assert.equal(deriveConversationVoiceTarget(admission, "session", false, "off"), null);
  assert.equal(conversationBindingKey(admission, "session", "off"), null);
});

test("privacy rotation removes media binding until the new authorized epoch is ready", () => {
  const before = snapshot();
  const previousBinding = conversationBindingKey(before, "session", "join");
  const rotating = snapshot(2);
  rotating.conversation!.mediaTarget = { id: "zone", generation: 2, available: false };
  assert.equal(deriveConversationVoiceTarget(rotating, "session", false, "join"), null);
  assert.equal(conversationBindingKey(rotating, "session", "listen"), null);
  const ready = snapshot(3);
  ready.conversation!.mediaTarget = { id: "zone", generation: 2, available: true };
  assert.notEqual(conversationBindingKey(ready, "session", "join"), previousBinding);
  assert.equal(deriveConversationVoiceTarget(ready, "session", false, "listen")?.mode, "listen");
  assert.equal(deriveConversationVoiceTarget(ready, "session", false, "off"), null);
});
