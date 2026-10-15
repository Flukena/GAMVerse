import assert from "node:assert/strict";
import test from "node:test";
import { microphoneLevelPercent } from "./DeviceSettingsMeter";

test("microphone meter reports silence and the RMS level of alternating samples", () => {
  assert.equal(microphoneLevelPercent(new Float32Array()), 0);
  assert.equal(microphoneLevelPercent(new Float32Array([0, 0])), 0);
  assert.equal(microphoneLevelPercent(new Float32Array([0.5, -0.5])), 50);
});

test("microphone meter clamps clipped audio to the accessible meter range", () => {
  assert.equal(microphoneLevelPercent(new Float32Array([2, -2])), 100);
});
