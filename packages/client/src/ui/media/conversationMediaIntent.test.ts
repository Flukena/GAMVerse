import assert from "node:assert/strict";
import test from "node:test";
import { availabilityPolicy, type ConversationSnapshot } from "@gammyverse/shared";
import { applyConversationMediaIntent, ConversationAdmissionIntent } from "./conversationMediaIntent";
import type { VoiceTarget } from "./voiceTarget";
import { ConversationState, deriveConversationVoiceTarget } from "./conversationState";
import { ConversationListeningPreferences, effectiveConversationMode } from "../conversations/conversationListening";

const target: VoiceTarget = { officeId: "office", sessionKey: "session", kind: "meeting", id: "room", mode: "listen" };

test("Listen clears queued publishing intent before changing the authorized target", () => {
  const calls: unknown[] = [];
  applyConversationMediaIntent({ suppressMedia() { calls.push("suppress"); }, setTarget(value) { calls.push(value); } }, target, "listen");
  assert.deepEqual(calls, ["suppress", target]);
});

test("Off closes media without reconnecting; Join requests authorization without unmuting", () => {
  const calls: unknown[] = [];
  const session = { suppressMedia() { calls.push("suppress"); }, setTarget(value: VoiceTarget | null) { calls.push(value); } };
  applyConversationMediaIntent(session, null, "off");
  assert.deepEqual(calls, ["suppress"]);
  calls.length = 0;
  const joined = { ...target, mode: "join" as const };
  applyConversationMediaIntent(session, joined, "join");
  assert.deepEqual(calls, [joined]);
});

test("revocation clears microphone intent while an admitted privacy rotation preserves it", () => {
  let muted = false;
  const targets: Array<VoiceTarget | null> = [];
  const session = { suppressMedia() { muted = true; }, setTarget(value: VoiceTarget | null) { targets.push(value); } };
  applyConversationMediaIntent(session, null, "join", { known: true, admitted: true, newLease: false });
  assert.equal(muted, false);
  assert.deepEqual(targets, [null]);
  applyConversationMediaIntent(session, null, "join", { known: true, admitted: false, newLease: false });
  assert.equal(muted, true);
  applyConversationMediaIntent(session, { ...target, mode: "join" }, "join", { known: true, admitted: true, newLease: false });
  assert.equal(muted, true);
});

function admittedSnapshot(leaseId?: string): ConversationSnapshot {
  return { officeId: "office", roomIncarnationId: "incarnation", revision: 1, admissionLeaseId: leaseId,
    conversation: { id: "conversation", kind: "meeting", mediaTarget: { id: "zone", generation: 1 }, members: [
      { id: "guest", username: "guest", sessionId: "session", displayName: "Guest", characterId: "avatar", mediaIdentity: "guest-media" },
    ] } };
}

test("a new guest enters muted from public audio while the same lease preserves microphone intent", () => {
  const admission = new ConversationAdmissionIntent();
  let muted = false;
  const session = { suppressMedia() { muted = true; }, setTarget() {} };
  applyConversationMediaIntent(session, target, "join", admission.receive(admittedSnapshot(), "session"));
  assert.equal(muted, false);
  applyConversationMediaIntent(session, target, "join", admission.receive(admittedSnapshot("first-lease"), "session"));
  assert.equal(muted, true);
  muted = false; // The admitted guest explicitly enables their microphone.
  const rotating = admittedSnapshot("first-lease");
  rotating.conversation!.mediaTarget = { id: "zone", generation: 2, available: false };
  applyConversationMediaIntent(session, null, "join", admission.receive(rotating, "session"));
  assert.equal(muted, false);
  const ready = admittedSnapshot("first-lease");
  ready.conversation!.mediaTarget.generation = 2;
  applyConversationMediaIntent(session, target, "join", admission.receive(ready, "session"));
  assert.equal(muted, false);
  applyConversationMediaIntent(session, null, "join", admission.receive(null, "session"));
  assert.equal(muted, false);
  assert.equal(admission.receive(ready, "session").newLease, false);
  applyConversationMediaIntent(session, null, "join", admission.receive({ ...ready, conversation: null }, "session"));
  assert.equal(muted, true);
  applyConversationMediaIntent(session, target, "join", admission.receive(admittedSnapshot("second-lease"), "session"));
  assert.equal(muted, true);
  assert.equal(admission.receive(admittedSnapshot("second-lease"), "replacement-session").newLease, true);
});

test("a proximity group membership change keeps active media intent during the room rotation", () => {
  const admission = new ConversationAdmissionIntent();
  const calls: unknown[] = [];
  const session = {
    suppressMedia() { calls.push("suppress"); },
    setTarget(value: VoiceTarget | null) { calls.push(value); },
    isProximityTarget: () => true,
  };
  const nearby = admittedSnapshot("first-group");
  nearby.conversation!.kind = "proximity";
  admission.receive(nearby, "session");
  const joined = { ...target, kind: "proximity" as const, id: "next-group", mode: "join" as const };
  const changedMembership = admittedSnapshot("next-group");
  changedMembership.conversation!.kind = "proximity";
  applyConversationMediaIntent(session, joined, "join", admission.receive(changedMembership, "session"));
  assert.deepEqual(calls, [joined]);
});

test("unknown conversation mode does not erase microphone intent while awaiting admission sync", () => {
  const admission = new ConversationAdmissionIntent();
  const preferences = new ConversationListeningPreferences();
  preferences.setMode("office", "conversation", "join");
  admission.receive(admittedSnapshot("lease"), "session");
  let muted = false;
  let currentTarget: VoiceTarget | null = target;
  const session = { suppressMedia() { muted = true; }, setTarget(value: VoiceTarget | null) { currentTarget = value; } };
  const unknownMode = preferences.mode("office", null, true);
  applyConversationMediaIntent(session, null, unknownMode, admission.receive(null, "session"));
  assert.equal(muted, false);
  assert.equal(currentTarget, null);
  applyConversationMediaIntent(session, target, preferences.mode("office", "conversation", true), admission.receive(admittedSnapshot("lease"), "session"));
  assert.equal(muted, false);
});

test("Away clears microphone intent even while the conversation admission is unknown", () => {
  const admission = new ConversationAdmissionIntent();
  let muted = false;
  const session = { suppressMedia() { muted = true; }, setTarget() {} };
  applyConversationMediaIntent(session, null, "off", admission.receive(null, "session"), availabilityPolicy("away").suppressAutomaticMedia);
  assert.equal(muted, true);
  applyConversationMediaIntent(session, target, "join", admission.receive(admittedSnapshot(), "session"), availabilityPolicy("available").suppressAutomaticMedia);
  assert.equal(muted, true);
});

test("confirmed nearby conversations automatically join without clearing current media intent", () => {
  const state = new ConversationState({ officeId: "office", transportKey: "transport", sessionId: "session" });
  const preferences = new ConversationListeningPreferences();
  const admission = new ConversationAdmissionIntent();
  const calls: unknown[] = [];
  const session = { suppressMedia() { calls.push("suppress"); }, setTarget(value: VoiceTarget | null) { calls.push(value); } };
  assert.equal(preferences.mode("office", state.snapshot?.conversation?.id ?? null, true), "off");
  assert.equal(deriveConversationVoiceTarget(state.snapshot, "session", false), null);
  for (const [index, id] of ["first-nearby", "next-nearby"].entries()) {
    const nearby = admittedSnapshot();
    nearby.revision += index;
    nearby.conversation!.kind = "proximity";
    nearby.conversation!.id = id;
    assert.equal(state.receive(nearby, "transport"), true);
    const mode = preferences.mode("office", state.snapshot!.conversation!.id, true);
    assert.equal(mode, "join");
    const joined = deriveConversationVoiceTarget(state.snapshot, "session", false, mode);
    assert.equal(joined?.mode, "join");
    applyConversationMediaIntent(session, joined, mode, admission.receive(state.snapshot, "session"));
    assert.deepEqual(calls, [joined]);
    calls.length = 0;
  }
});

test("automatic joining respects explicit Off, disabled preference and suppressed availability", () => {
  const preferences = new ConversationListeningPreferences();
  preferences.setMode("office", "conversation", "off");
  const mutedMode = preferences.mode("office", "conversation", true);
  assert.equal(mutedMode, "off");
  assert.equal(deriveConversationVoiceTarget(admittedSnapshot(), "session", false, mutedMode), null);
  assert.equal(preferences.mode("office", "disabled", false), "off");
  const requested = preferences.mode("office", "nearby", true);
  assert.equal(requested, "join");
  for (const status of ["do-not-disturb", "in-meeting", "away"] as const) {
    const mode = effectiveConversationMode(requested, status);
    assert.equal(mode, "off");
    assert.equal(deriveConversationVoiceTarget(admittedSnapshot(), "session", false, mode), null);
    const calls: unknown[] = [];
    applyConversationMediaIntent({ suppressMedia() { calls.push("suppress"); }, setTarget(value) { calls.push(value); } }, null, mode,
      { known: true, admitted: true, newLease: false }, availabilityPolicy(status).suppressAutomaticMedia);
    assert.deepEqual(calls, ["suppress"]);
  }
  assert.equal(effectiveConversationMode(preferences.mode("office", "nearby", true), "available"), "join");
  assert.equal(preferences.mode("office", "conversation", true), "off");
});
