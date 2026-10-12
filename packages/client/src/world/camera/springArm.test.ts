import assert from "node:assert/strict";
import test from "node:test";
import { resolveSpringArmDistance } from "./springArm";

const DESIRED_DISTANCE_M = 8;
const PREVIOUS_DISTANCE_M = 2;
const HIT_DISTANCE_M = 3;
const PADDING_M = 0.2;
const MIN_DISTANCE_M = 0.5;
const STEP_SEC = 1 / 60;
const EASING_STEPS_COUNT = 120;
const INSIDE_MIN_HIT_M = 0.1;
const TOLERANCE_M = 1e-9;
const ARM = { desired: DESIRED_DISTANCE_M, hit: null, padding: PADDING_M, min: MIN_DISTANCE_M, previous: PREVIOUS_DISTANCE_M, deltaSec: STEP_SEC };

test("no hit eases toward the desired distance and initial placement uses desired", () => {
  const distanceM = resolveSpringArmDistance(ARM);
  assert.ok(distanceM > PREVIOUS_DISTANCE_M && distanceM < DESIRED_DISTANCE_M);
  assert.equal(resolveSpringArmDistance({ ...ARM, previous: null }), DESIRED_DISTANCE_M);
});

test("a hit shortens immediately to hit distance minus padding", () => {
  const distanceM = resolveSpringArmDistance({ ...ARM, hit: HIT_DISTANCE_M, previous: DESIRED_DISTANCE_M });
  assert.equal(distanceM, HIT_DISTANCE_M - PADDING_M);
});

test("near hits clamp to the minimum distance", () => {
  assert.equal(resolveSpringArmDistance({ ...ARM, hit: INSIDE_MIN_HIT_M }), MIN_DISTANCE_M);
});

test("outward recovery is monotonic and never overshoots", () => {
  let previous = PREVIOUS_DISTANCE_M;
  for (let step = 0; step < EASING_STEPS_COUNT; step += 1) {
    const distanceM = resolveSpringArmDistance({ ...ARM, previous });
    assert.ok(distanceM >= previous && distanceM <= DESIRED_DISTANCE_M);
    previous = distanceM;
  }
});

test("zooming inward snaps and outward easing is frame-rate independent", () => {
  assert.equal(resolveSpringArmDistance({ ...ARM, desired: MIN_DISTANCE_M }), MIN_DISTANCE_M);
  const whole = resolveSpringArmDistance({ ...ARM, deltaSec: STEP_SEC * 2 });
  const half = resolveSpringArmDistance(ARM);
  const twice = resolveSpringArmDistance({ ...ARM, previous: half });
  assert.ok(Math.abs(whole - twice) < TOLERANCE_M);
});
