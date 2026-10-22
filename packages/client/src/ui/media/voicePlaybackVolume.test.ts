import assert from "node:assert/strict";
import test from "node:test";
import { voicePlaybackVolume } from "./voicePlaybackVolume";

test("deafen takes priority over per-person boost and proximity updates", () => {
  assert.equal(voicePlaybackVolume(1.5, true), 0);
  assert.equal(voicePlaybackVolume(1.5, true, 0.5), 0);
  assert.equal(voicePlaybackVolume(0.5, true, 1), 0);
});

test("undeafening restores the saved per-person level with current distance attenuation", () => {
  assert.equal(voicePlaybackVolume(1.5, false), 1.5);
  assert.equal(voicePlaybackVolume(1.5, false, 0.5), 0.75);
  assert.equal(voicePlaybackVolume(0, false), 0);
});
