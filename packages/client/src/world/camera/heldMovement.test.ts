import assert from "node:assert/strict";
import test from "node:test";
import { resolveHeldMovement, type HeldMovementFrame } from "./heldMovement";
import { CHARACTER_TURN_STEP_RAD } from "./lockedMovement";

const TEST_CAMERA_YAW_RAD = Math.PI / 2;
const TEST_NOW_MS = 100;
const ROTATION_TOLERANCE_RAD = 1e-9;
const FRAME: HeldMovementFrame = {
  keys: new Set(["KeyW"]), map2d: false, firstPerson: false, behindCharacter: true,
  cameraYawRad: TEST_CAMERA_YAW_RAD, playerRotationRad: 0, driving: false,
  nowMs: TEST_NOW_MS, lockedTurn: null,
};

test("2D movement is north-up even when 3D camera is locked behind character", () => {
  const north = resolveHeldMovement({ ...FRAME, map2d: true });
  assert.equal(north.input.x, 0);
  assert.equal(north.input.z, -1);
  assert.equal(north.input.facingYaw, undefined);
  const east = resolveHeldMovement({ ...FRAME, keys: new Set(["KeyD"]), map2d: true });
  assert.equal(east.input.x, 1);
  assert.ok(Math.abs(east.input.z) < ROTATION_TOLERANCE_RAD);
  assert.equal(east.lockedTurn, null);
});

test("locked 3D walks along heading and A/D steps turn intent", () => {
  const walking = resolveHeldMovement(FRAME);
  assert.ok(Math.abs(walking.input.x) < ROTATION_TOLERANCE_RAD);
  assert.equal(walking.input.z, 1);
  assert.equal(walking.input.facingYaw, 0);
  const turning = resolveHeldMovement({ ...FRAME, keys: new Set(["KeyD"]) });
  assert.ok(Math.abs((turning.input.facingYaw ?? 0) + CHARACTER_TURN_STEP_RAD) < ROTATION_TOLERANCE_RAD);
  assert.equal(turning.input.x, 0);
  assert.equal(turning.input.z, 0);
  assert.ok(turning.lockedTurn);
});

test("unlocked 3D stays camera-relative and FPP retains aim yaw", () => {
  const free = resolveHeldMovement({ ...FRAME, behindCharacter: false });
  assert.equal(free.input.x, -1);
  assert.ok(Math.abs(free.input.z) < ROTATION_TOLERANCE_RAD);
  assert.equal(free.input.facingYaw, undefined);
  const fpp = resolveHeldMovement({ ...FRAME, firstPerson: true });
  assert.equal(fpp.input.facingYaw, TEST_CAMERA_YAW_RAD + Math.PI);
  assert.equal(fpp.lockedTurn, null);
});


test("driving stays camera-relative while behind-character mode is enabled", () => {
  const driving = resolveHeldMovement({ ...FRAME, driving: true, keys: new Set(["KeyD"]) });
  assert.ok(Math.abs(driving.input.x) < ROTATION_TOLERANCE_RAD);
  assert.equal(driving.input.z, -1);
  assert.equal(driving.input.facingYaw, undefined);
  assert.equal(driving.lockedTurn, null);
});
