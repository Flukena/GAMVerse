import assert from "node:assert/strict";
import test from "node:test";
import { createFootstepPcmVariants } from "./footstepPcm";

const SAMPLE_RATE_HZ = 48000;
const SILENCE_THRESHOLD = 0.001;

function meanEnergy(samples: Float32Array, startRatio: number, endRatio: number) {
  const start = Math.floor(samples.length * startRatio);
  const end = Math.floor(samples.length * endRatio);
  let energy = 0;
  for (let index = start; index < end; index++) energy += samples[index]! ** 2;
  return energy / (end - start);
}

test("block-style footfalls are short, finite and safely bounded", () => {
  const variants = createFootstepPcmVariants(SAMPLE_RATE_HZ);
  assert.ok(variants.length >= 4);
  for (const samples of variants) {
    assert.ok(samples.length >= SAMPLE_RATE_HZ * 0.08 && samples.length <= SAMPLE_RATE_HZ * 0.2);
    assert.ok(samples.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 0.85));
    assert.ok(meanEnergy(samples, 0, 0.5) > 0.001);
    assert.ok(meanEnergy(samples, 0.8, 1) < meanEnergy(samples, 0, 0.5) * 0.02);
    assert.ok(Math.abs(samples[0]!) < SILENCE_THRESHOLD);
    assert.ok(Math.abs(samples[samples.length - 1]!) < SILENCE_THRESHOLD);
  }
});

test("variants have original deterministic crunch instead of identical tonal beats", () => {
  const variants = createFootstepPcmVariants(SAMPLE_RATE_HZ);
  assert.deepEqual(createFootstepPcmVariants(SAMPLE_RATE_HZ), variants);
  for (let index = 1; index < variants.length; index++) assert.notDeepEqual(variants[0], variants[index]);
  const samples = variants[0]!;
  let signChanges = 0;
  for (let index = 1; index < samples.length; index++) if (samples[index]! * samples[index - 1]! < 0) signChanges++;
  assert.ok(signChanges > 100, "dry noise/crunch must replace the earlier low-frequency sine beep");
});

test("synthesis follows device sample rate and rejects invalid allocation sizes", () => {
  assert.equal(createFootstepPcmVariants(24000)[0]!.length * 2, createFootstepPcmVariants(SAMPLE_RATE_HZ)[0]!.length);
  for (const sampleRateHz of [0, 1, -1, Number.NaN, Number.POSITIVE_INFINITY, 1000000]) {
    assert.throws(() => createFootstepPcmVariants(sampleRateHz), RangeError);
  }
});
