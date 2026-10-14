import assert from "node:assert/strict";
import test from "node:test";
import { smoothAvatarPose, isPoseSettled } from "./avatarPoseSmoother";
const EPSILON = 1e-8;
const DELTA_S = 1 / 60;
const CONVERGENCE_FRAMES = 300;
test("shared avatar pose smoother converges position and shortest yaw", () => {
  let pose = { x: 0, z: 0, rotation: Math.PI - 0.1 };
  const target = { x: 8, z: 6, rotation: -Math.PI + 0.1 };
  assert.equal(isPoseSettled(pose, target), false);
  for (let frame = 0; frame < CONVERGENCE_FRAMES; frame++)
    pose = smoothAvatarPose(pose, target, DELTA_S, false);
  assert.equal(isPoseSettled(pose, target), true);
  assert.ok(Math.abs(pose.x - target.x) < EPSILON);
});
