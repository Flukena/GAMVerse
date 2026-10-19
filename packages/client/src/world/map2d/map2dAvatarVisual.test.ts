import assert from "node:assert/strict";
import test from "node:test";
import { advanceMap2dAvatarVisual, createMap2dAvatarVisual } from "./map2dAvatarVisual";

const STEP_DELTA_S = 1 / 60;
function advance(distanceM: number, deltaS = STEP_DELTA_S, sittingPropId = "") {
  const visual = createMap2dAvatarVisual();
  advanceMap2dAvatarVisual(visual, { previousX: 0, previousZ: 0, x: distanceM, z: 0, deltaS, sittingPropId });
  return visual;
}
test("seated authority wins over displacement and keeps a resting gait", () => {
  const visual = advance(1, STEP_DELTA_S, "chair:seat-1");
  assert.equal(visual.motion, "seated");
  assert.equal(visual.stridePhaseRad, 0);
});
test("walk gait follows travelled distance rather than frame count", () => {
  const single = advance(0.3, 0.1);
  const split = createMap2dAvatarVisual();
  for (let index = 0; index < 3; index += 1)
    advanceMap2dAvatarVisual(split, { previousX: index * 0.1, previousZ: 0, x: (index + 1) * 0.1, z: 0, deltaS: 0.1 / 3 });
  assert.equal(single.motion, "walking");
  assert.ok(Math.abs(single.stridePhaseRad - split.stridePhaseRad) < 1e-12);
});
test("settled idle stops invalidating and zero delta produces a finite resting pose", () => {
  const visual = advance(0.1);
  const resting = { previousX: 1, previousZ: 0, x: 1, z: 0, deltaS: STEP_DELTA_S };
  assert.equal(advanceMap2dAvatarVisual(visual, resting), true);
  assert.equal(visual.motion, "idle");
  assert.equal(advanceMap2dAvatarVisual(visual, resting), false);
  assert.deepEqual(advance(1, 0), createMap2dAvatarVisual());
});

test("natural walking takes a 1.6 m full stride and fast travel cannot exceed 1.5 cycles per second", () => {
  assert.ok(Math.abs(advance(0.4, 0.5).stridePhaseRad - Math.PI / 2) < 1e-12);
  const fast = advance(3, 0.1);
  assert.ok(Math.abs(fast.stridePhaseRad - Math.PI * 0.3) < 1e-12);
  const slower = advance(3, 0.2);
  assert.ok(Math.abs(slower.stridePhaseRad - fast.stridePhaseRad * 2) < 1e-12);
});
