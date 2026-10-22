import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationSnapshot } from "@gammyverse/shared";
import { applyConversationMediaIntent, ConversationAdmissionIntent } from "./conversationMediaIntent";
import type { VoiceTarget } from "./voiceTarget";
import { ConversationState, deriveConversationVoiceTarget } from "./conversationState";
import { ConversationListeningPreferences } from "../conversations/conversationListening";

const target: VoiceTarget = { officeId: "office", sessionKey: "session", kind: "meeting", id: "room", mode: "listen" };

function admittedSnapshot(leaseId?: string): ConversationSnapshot {
  return { officeId: "office", roomIncarnationId: "incarnation", revision: 1, admissionLeaseId: leaseId,
    conversation: { id: "conversation", kind: "meeting", mediaTarget: { id: "zone", generation: 1 }, members: [
      { id: "guest", username: "guest", sessionId: "session", displayName: "Guest", characterId: "avatar", mediaIdentity: "guest-media" },
    ] } };
}

test("Listen requests its receive-only target without changing microphone choice", () => {
  const targets: Array<VoiceTarget | null> = [];
  applyConversationMediaIntent({ setTarget(value) { targets.push(value); } }, target, "listen");
  assert.deepEqual(targets, [target]);
});

test("explicit Off closes the actual room while Join requests a fresh authorized target", () => {
  const targets: Array<VoiceTarget | null> = [];
  const session = { setTarget(value: VoiceTarget | null) { targets.push(value); } };
  applyConversationMediaIntent(session, target, "off");
  assert.deepEqual(targets, [null]);
  const joined = { ...target, mode: "join" as const };
  applyConversationMediaIntent(session, joined, "join");
  assert.deepEqual(targets, [null, joined]);
});

test("unknown or revoked admission cannot open a supplied room target", () => {
  for (const admission of [
    { known: false, admitted: true, newLease: false },
    { known: true, admitted: false, newLease: false },
  ]) {
    const targets: Array<VoiceTarget | null> = [];
    applyConversationMediaIntent({ setTarget(value) { targets.push(value); } }, target, "join", admission);
    assert.deepEqual(targets, [null]);
  }
});

test("new admission leases request authorization without replacing manual microphone choice", () => {
  const admission = new ConversationAdmissionIntent();
  const targets: Array<VoiceTarget | null> = [];
  const session = { setTarget(value: VoiceTarget | null) { targets.push(value); } };
  const joined = { ...target, mode: "join" as const };
  const first = admission.receive(admittedSnapshot("first-lease"), "session");
  assert.equal(first.newLease, true);
  applyConversationMediaIntent(session, joined, "join", first);
  const rotating = admittedSnapshot("first-lease");
  rotating.conversation!.mediaTarget = { id: "zone", generation: 2, available: false };
  applyConversationMediaIntent(session, null, "join", admission.receive(rotating, "session"));
  const replacement = admission.receive(admittedSnapshot("second-lease"), "session");
  assert.equal(replacement.newLease, true);
  applyConversationMediaIntent(session, joined, "join", replacement);
  assert.deepEqual(targets, [joined, null, joined]);
  assert.equal(admission.receive(admittedSnapshot("second-lease"), "replacement-session").newLease, true);
});

test("an unknown snapshot cannot reset the tracked lease or restore an old target", () => {
  const admission = new ConversationAdmissionIntent();
  const known = admittedSnapshot("lease");
  admission.receive(known, "session");
  const targets: Array<VoiceTarget | null> = [];
  applyConversationMediaIntent({ setTarget(value) { targets.push(value); } }, null, "off", admission.receive(null, "session"));
  assert.deepEqual(targets, [null]);
  assert.equal(admission.receive(known, "session").newLease, false);
});

test("confirmed nearby conversations automatically authorize Join while explicit Off remains off", () => {
  const state = new ConversationState({ officeId: "office", transportKey: "transport", sessionId: "session" });
  const preferences = new ConversationListeningPreferences();
  const admission = new ConversationAdmissionIntent();
  assert.equal(preferences.mode("office", null, true), "off");
  assert.equal(deriveConversationVoiceTarget(state.snapshot, "session", false), null);
  for (const [index, id] of ["first-nearby", "next-nearby"].entries()) {
    const nearby = admittedSnapshot();
    nearby.revision += index;
    nearby.conversation!.kind = "proximity";
    nearby.conversation!.id = id;
    assert.equal(state.receive(nearby, "transport"), true);
    const mode = preferences.mode("office", id, true);
    assert.equal(mode, "join");
    const joined = deriveConversationVoiceTarget(state.snapshot, "session", false, mode);
    const targets: Array<VoiceTarget | null> = [];
    applyConversationMediaIntent({ setTarget(value) { targets.push(value); } }, joined, mode, admission.receive(state.snapshot, "session"));
    assert.deepEqual(targets, [joined]);
  }
  preferences.setMode("office", "next-nearby", "off");
  assert.equal(preferences.mode("office", "next-nearby", true), "off");
  assert.equal(deriveConversationVoiceTarget(state.snapshot, "session", false, "off"), null);
});
