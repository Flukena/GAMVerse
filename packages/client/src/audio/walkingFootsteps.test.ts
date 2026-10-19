import assert from "node:assert/strict";
import test from "node:test";
import { WalkingFootsteps } from "./walkingFootsteps";
import type { FootstepSound } from "./softFootstepSound";

const FRAME_INTERVAL_MS = 100;
const WALK_DISTANCE_PER_FRAME_M = 0.3;

class RecordingSound implements FootstepSound {
  plays = 0;
  stopped = false;
  disposed = false;
  unlock() {}
  play() { this.plays++; this.stopped = false; }
  stop() { this.stopped = true; }
  dispose() { this.disposed = true; }
}

function walk(footsteps: WalkingFootsteps, overrides: { sittingPropId?: string; vehicleId?: string } = {}, blocked = false) {
  for (let frame = 0; frame <= 10; frame++) {
    footsteps.update({ x: frame * WALK_DISTANCE_PER_FRAME_M, z: 0, ...overrides }, "self", frame * FRAME_INTERVAL_MS, blocked);
  }
}

test("local walking plays footsteps without consulting keyboard intent", () => {
  const sound = new RecordingSound();
  walk(new WalkingFootsteps(sound));
  assert.ok(sound.plays >= 2);
});

for (const [name, overrides, blocked] of [
  ["seated", { sittingPropId: "chair:seat" }, false],
  ["driving", { vehicleId: "car" }, false],
  ["paused, hidden or deafened", {}, true],
] as const) {
  test(`${name} movement stays silent`, () => {
    const sound = new RecordingSound();
    walk(new WalkingFootsteps(sound), overrides, blocked);
    assert.equal(sound.plays, 0);
    assert.equal(sound.stopped, true);
  });
}

test("disabled preference silences walking immediately and can be re-enabled", () => {
  const sound = new RecordingSound();
  const footsteps = new WalkingFootsteps(sound);
  footsteps.setEnabled(false);
  walk(footsteps);
  assert.equal(sound.plays, 0);
  footsteps.setEnabled(true);
  walk(footsteps);
  assert.ok(sound.plays >= 2);
});

test("disconnect and session replacement discard old stride distance", () => {
  const sound = new RecordingSound();
  const footsteps = new WalkingFootsteps(sound);
  footsteps.update({ x: 0, z: 0 }, "self", 0, false);
  footsteps.update({ x: 0.6, z: 0 }, "self", 100, false);
  footsteps.update(undefined, null, 200, false);
  footsteps.update({ x: 0.9, z: 0 }, "replacement", 300, false);
  footsteps.update({ x: 1.2, z: 0 }, "replacement", 400, false);
  assert.equal(sound.plays, 0);
});

test("dispose closes sound and prevents subsequent frames from playing", () => {
  const sound = new RecordingSound();
  const footsteps = new WalkingFootsteps(sound);
  footsteps.dispose();
  walk(footsteps);
  assert.equal(sound.disposed, true);
  assert.equal(sound.plays, 0);
});
