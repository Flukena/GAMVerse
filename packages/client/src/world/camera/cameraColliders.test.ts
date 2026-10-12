import assert from "node:assert/strict";
import test from "node:test";
import { type RoomLayout } from "@gammyverse/shared";
import { Vector3 } from "three";
import { CameraColliders } from "./cameraColliders";
import type { CameraMode } from "./cameraState";
import { type CameraPose } from "./cameraPose";

const STEP_SEC = 1 / 60;
const RAY_LENGTH_M = 8;
const WALL_CENTER_Z_M = 4;
const WALL_THICKNESS_M = 0.2;
const EXPECTED_PADDING_M = 0.2;
const WALL_LENGTH_M = 10;
const WALL_HEIGHT_M = 3;
const TARGET_HEIGHT_M = 1;
const DOOR_WIDTH_M = 2;
const DOOR_SIDE_RAY_X_M = 3;
// Three.js BoxGeometry stores float32 vertices, so hit distances carry ~1e-9 m error.
const TOLERANCE_M = 1e-6;
const TEST_FOV_DEG = 38;
const TEST_WALL_ID = "camera-wall";
const WALL: RoomLayout["walls"][number] = { id: TEST_WALL_ID, x: 0, z: WALL_CENTER_Z_M, axis: "horizontal", length: WALL_LENGTH_M, thickness: WALL_THICKNESS_M, height: WALL_HEIGHT_M };
const LAYOUT: RoomLayout = { version: 1, walls: [WALL], doors: [], props: [], zones: [] };
const OFFSET = { x: 0, z: 0 };

function rayPose(x = 0): CameraPose {
  return { lookAt: new Vector3(x, TARGET_HEIGHT_M, 0), position: new Vector3(x, TARGET_HEIGHT_M, RAY_LENGTH_M), fov: TEST_FOV_DEG };
}

test("TPP raycast applies immediate wall clearance while all other modes bypass it", () => {
  const colliders = new CameraColliders(LAYOUT, OFFSET);
  try {
    const pose = rayPose();
    const blocked = colliders.apply(pose, "tpp", STEP_SEC, false);
    const expectedM = WALL_CENTER_Z_M - WALL_THICKNESS_M / 2 - EXPECTED_PADDING_M;
    assert.ok(Math.abs(blocked.position.z - expectedM) < TOLERANCE_M);
    for (const mode of ["fpp", "free", "map2d"] as const satisfies readonly CameraMode[]) {
      assert.equal(colliders.apply(pose, mode, STEP_SEC, false), pose);
    }
  } finally {
    colliders.dispose();
  }
});

test("door opening leaves a clear ray while solid wall beside it still occludes", () => {
  const layout = { ...LAYOUT, doors: [{ id: "camera-door", wallId: TEST_WALL_ID, offset: 0, width: DOOR_WIDTH_M }] };
  const colliders = new CameraColliders(layout, OFFSET);
  try {
    assert.equal(colliders.apply(rayPose(), "tpp", STEP_SEC, true).position.z, RAY_LENGTH_M);
    assert.ok(colliders.apply(rayPose(DOOR_SIDE_RAY_X_M), "tpp", STEP_SEC, true).position.z < WALL_CENTER_Z_M);
  } finally {
    colliders.dispose();
  }
});

test("collision props occlude using their elevated footprint; decorative props do not", () => {
  const prop = { id: "camera-prop", asset: "test-prop", x: 0, z: WALL_CENTER_Z_M, width: DOOR_WIDTH_M, depth: DOOR_WIDTH_M, rotation: 0, collision: true, elevation: TARGET_HEIGHT_M / 2 };
  const collision = new CameraColliders({ ...LAYOUT, walls: [], props: [prop] }, OFFSET);
  const decoration = new CameraColliders({ ...LAYOUT, walls: [], props: [{ ...prop, collision: false }] }, OFFSET);
  try {
    const pose = rayPose();
    assert.ok(collision.apply(pose, "tpp", STEP_SEC, true).position.z < WALL_CENTER_Z_M);
    assert.equal(decoration.apply(pose, "tpp", STEP_SEC, true).position.z, RAY_LENGTH_M);
  } finally {
    collision.dispose();
    decoration.dispose();
  }
});
