import assert from "node:assert/strict";
import test from "node:test";
import { microphoneControlState, type MicrophoneControlInput } from "./microphoneControlState";

const USER_ENABLED_INPUT: MicrophoneControlInput = {
  desiredMuted: false, actualMuted: false, connected: true,
  publishAllowed: true, unavailableReason: null, error: null,
};

test("a session gap keeps the user's enabled choice and offers the off action", () => {
  const state = microphoneControlState({ ...USER_ENABLED_INPUT, connected: false, actualMuted: true });
  assert.equal(state.action, "Turn microphone off");
  assert.equal(state.pending, true);
  assert.match(state.title, /waiting for a voice connection/);
});

test("receive-only authorization preserves the choice without claiming the mic is publishing", () => {
  const state = microphoneControlState({ ...USER_ENABLED_INPUT, actualMuted: true, publishAllowed: false, unavailableReason: "Join to publish." });
  assert.equal(state.action, "Turn microphone off");
  assert.equal(state.pending, true);
  assert.match(state.title, /Join to publish/);
  assert.match(state.title, /choice is saved/);
});

test("a capture failure keeps device guidance while the user's choice remains enabled", () => {
  const deviceError = "Allow microphone access in browser settings.";
  const state = microphoneControlState({ ...USER_ENABLED_INPUT, actualMuted: true, error: deviceError });
  assert.equal(state.action, "Turn microphone off");
  assert.equal(state.title, deviceError);
  assert.equal(state.pending, true);
});

test("only the user's disabled choice changes the action back to on", () => {
  const state = microphoneControlState({ ...USER_ENABLED_INPUT, desiredMuted: true, connected: false, actualMuted: true });
  assert.equal(state.action, "Turn microphone on");
  assert.equal(state.pending, false);
});
