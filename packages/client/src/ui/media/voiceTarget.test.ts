import assert from "node:assert/strict";
import test from "node:test";
import { resolveVoiceTarget, voiceTargetKey } from "./voiceTarget.ts";

const inputs = { officeId: "office", sessionKey: "session", paused: false, meetingZoneId: "meeting", privateZoneId: "private", proximityGroupId: "group" };
test("meeting wins over private and proximity; pause leaves everything", () => {
  assert.equal(resolveVoiceTarget(inputs)?.kind, "meeting");
  assert.equal(resolveVoiceTarget({ ...inputs, meetingZoneId: null })?.kind, "private");
  assert.equal(resolveVoiceTarget({ ...inputs, meetingZoneId: null, privateZoneId: null })?.kind, "proximity");
  assert.equal(resolveVoiceTarget({ ...inputs, paused: true }), null);
});
test("target key includes zone, office and realtime session identity", () => {
  const target = resolveVoiceTarget(inputs)!;
  for (const changed of [{ ...target, id: "B" }, { ...target, officeId: "other" }, { ...target, sessionKey: "other" }]) {
    assert.notEqual(voiceTargetKey(target), voiceTargetKey(changed));
  }
});
