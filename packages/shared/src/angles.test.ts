import assert from "node:assert/strict";
import test from "node:test";
import { FULL_TURN_RAD, lerpAngle, shortestAngleDelta } from "./angles.ts";

const WRAP_START_RAD = 3.1;
const WRAP_END_RAD = -3.1;
const WRAP_DELTA_RAD = FULL_TURN_RAD - WRAP_START_RAD + WRAP_END_RAD;
const QUARTER_TURN_RAD = Math.PI / 2;
const ANGLE_TOLERANCE_RAD = 1e-9;
const MIDPOINT_BLEND_RATIO = 0.5;
const REVOLUTION_OFFSETS_COUNT = [-3, -1, 0, 1, 3];

function assertAngle(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < ANGLE_TOLERANCE_RAD, `${actual} differs from ${expected}`);
}

test("takes the short positive turn across the signed-angle boundary", () => {
  assertAngle(shortestAngleDelta(WRAP_START_RAD, WRAP_END_RAD), WRAP_DELTA_RAD);
  assertAngle(shortestAngleDelta(WRAP_END_RAD, WRAP_START_RAD), -WRAP_DELTA_RAD);
});

test("preserves a quarter turn and is independent of full revolutions", () => {
  assertAngle(shortestAngleDelta(0, QUARTER_TURN_RAD), QUARTER_TURN_RAD);
  for (const fromOffset of REVOLUTION_OFFSETS_COUNT) {
    for (const toOffset of REVOLUTION_OFFSETS_COUNT) {
      const delta = shortestAngleDelta(WRAP_START_RAD + fromOffset * FULL_TURN_RAD, WRAP_END_RAD + toOffset * FULL_TURN_RAD);
      assertAngle(delta, WRAP_DELTA_RAD);
      assert.ok(delta >= -Math.PI && delta <= Math.PI);
    }
  }
});

test("interpolates across the boundary through pi instead of zero", () => {
  assertAngle(lerpAngle(WRAP_START_RAD, WRAP_END_RAD, MIDPOINT_BLEND_RATIO), Math.PI);
});
