import assert from "node:assert/strict";
import test from "node:test";
import { CONVERSATION_OVERRIDE_MAX_COUNT, ConversationListeningPreferences, effectiveConversationMode, readAutoListenPreference } from "./conversationListening";

test("explicit conversation mute survives auto-listen changes and transport generations", () => {
  const preferences = new ConversationListeningPreferences();
  assert.equal(preferences.mode("office", "first", true), "join");
  preferences.setMode("office", "first", "off");
  assert.equal(preferences.mode("office", "first", true), "off");
  assert.equal(preferences.mode("office", "first", false), "off");
  assert.equal(preferences.mode("office", "new", false), "off");
  assert.equal(preferences.mode("office", "new", true), "off");
  assert.equal(preferences.mode("other-office", "first", true), "join");
});
test("automatic joining preserves an existing choice when the global preference changes", () => {
  const preferences = new ConversationListeningPreferences();
  assert.equal(preferences.mode("office", "conversation", true), "join");
  assert.equal(preferences.mode("office", "conversation", false), "join");
  preferences.setMode("office", "conversation", "listen");
  assert.equal(preferences.mode("office", "conversation", true), "listen");
  assert.equal(preferences.mode("office", "conversation", false), "listen");
  assert.equal(preferences.mode(null, "conversation", true), "off");
});
test("availability suppresses media without changing the requested mode or user availability", () => {
  for (const status of ["do-not-disturb", "in-meeting", "away"] as const) assert.equal(effectiveConversationMode("join", status), "off");
  assert.equal(effectiveConversationMode("listen", "available"), "listen");
  assert.equal(effectiveConversationMode("off", "available"), "off");
  assert.equal(readAutoListenPreference(null), true);
  assert.equal(readAutoListenPreference("false"), false);
  assert.equal(readAutoListenPreference("invalid"), true);
});
test("conversation override cache is bounded and evicts the oldest conversation", () => {
  const preferences = new ConversationListeningPreferences();
  preferences.setMode("office", "oldest", "off");
  for (let index = 0; index < CONVERSATION_OVERRIDE_MAX_COUNT; index++) preferences.setMode("office", `conversation-${index}`, "join");
  assert.equal(preferences.mode("office", "conversation-0", false), "join");
  assert.equal(preferences.mode("office", "oldest", true), "join");
});
