import assert from "node:assert/strict";
import test from "node:test";
import { FootstepCadence } from "./footstepCadence";

const FRAME_INTERVAL_MS = 100;
const WALK_DISTANCE_PER_FRAME_M = 0.3;

function walk(cadence: FootstepCadence, frames = 20, startAtMs = 0, startX = 0) {
  const steps: number[] = [];
  for (let frame = 0; frame <= frames; frame++) {
    const nowMs = startAtMs + frame * FRAME_INTERVAL_MS;
    if (cadence.advance(startX + frame * WALK_DISTANCE_PER_FRAME_M, 0, nowMs)) steps.push(nowMs);
  }
  return steps;
}

test("walking produces soft bounded cadence from actual distance", () => {
  const steps = walk(new FootstepCadence());
  assert.ok(steps.length >= 3 && steps.length <= 6);
  for (let index = 1; index < steps.length; index++) assert.ok(steps[index]! - steps[index - 1]! >= 380);
});

test("idle and wall-blocked movement never make footsteps", () => {
  const cadence = new FootstepCadence();
  for (let frame = 0; frame < 100; frame++) assert.equal(cadence.advance(5, 5, frame * FRAME_INTERVAL_MS), false);
});

test("teleports and resumed frames do not make catch-up bursts", () => {
  const cadence = new FootstepCadence();
  cadence.advance(0, 0, 0);
  assert.equal(cadence.advance(20, 0, 100), false);
  assert.equal(cadence.advance(20.3, 0, 200), false);
  assert.equal(cadence.advance(25, 0, 3000), false);
  assert.equal(cadence.advance(25.3, 0, 3100), false);
});

test("reset drops previous movement when seated, muted, paused or disconnected", () => {
  const cadence = new FootstepCadence();
  walk(cadence, 2);
  cadence.reset();
  assert.equal(cadence.advance(8, 0, 300), false);
  assert.equal(cadence.advance(8.3, 0, 400), false);
});

test("idle distance does not leak into a new walking sequence", () => {
  const cadence = new FootstepCadence();
  cadence.advance(0, 0, 0);
  cadence.advance(0.6, 0, 100);
  for (let nowMs = 200; nowMs <= 1000; nowMs += 100) cadence.advance(0.6, 0, nowMs);
  assert.equal(cadence.advance(0.9, 0, 1100), false);
});

test("invalid positions reset without poisoning subsequent movement", () => {
  const cadence = new FootstepCadence();
  cadence.advance(0, 0, 0);
  assert.equal(cadence.advance(Number.NaN, 0, 100), false);
  assert.equal(cadence.advance(1, 0, 200), false);
  assert.ok(walk(cadence, 20, 300, 1).length >= 3);
});
