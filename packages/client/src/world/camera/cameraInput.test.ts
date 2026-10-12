import assert from "node:assert/strict";
import test from "node:test";
import { CAMERA } from "@gammyverse/shared";
import { MathUtils, Vector3 } from "three";
import { createCameraState } from "./cameraState";
import { rotateFirstPersonAim, panCameraTarget, cameraWheelEvent, panEditorCamera } from "./cameraInput";
import { FPP_POINTER_SENSITIVITY_RAD_PER_PIXEL } from "./constants";

const EXPECTED_LIMIT_DEG = 75;
const LARGE_DRAG_PIXEL = 100_000;

const PAN_FOV_DEG = 90;
const PAN_DISTANCE_M = 10;
const VIEWPORT_HEIGHT_PIXEL = 100;
const DRAG_PIXEL = 10;
const EXPECTED_PAN_X_M = -2;
const TEST_TOLERANCE_M = 1e-9;
const EDIT_WIDTH_M = 100;
const EDIT_DEPTH_M = 100;
const EDIT_CENTER_M = 50;
const EDIT_STEP_SEC = 1 / 18;
const EXPECTED_EDIT_STEP_M = 1;
const LIVE_ZOOM_STEP_M = 1.5;


test("drag and pointer-lock use the same conservative 75 degree pitch limit", () => {
  for (const sensitivity of [CAMERA.dragSensitivity, FPP_POINTER_SENSITIVITY_RAD_PER_PIXEL]) {
    const up = rotateFirstPersonAim(0, 0, 0, -LARGE_DRAG_PIXEL, sensitivity);
    const down = rotateFirstPersonAim(0, 0, 0, LARGE_DRAG_PIXEL, sensitivity);
    assert.equal(up.pitchRad, MathUtils.degToRad(EXPECTED_LIMIT_DEG));
    assert.equal(down.pitchRad, -MathUtils.degToRad(EXPECTED_LIMIT_DEG));
  }
});

test("pointer pan uses the camera axes and preserves the input target", () => {
  const target = new Vector3();
  const result = panCameraTarget({ target, yawRad: 0, distanceM: PAN_DISTANCE_M, fovDeg: PAN_FOV_DEG, viewportHeightPixel: VIEWPORT_HEIGHT_PIXEL, deltaXPixel: DRAG_PIXEL, deltaYPixel: 0 });
  assert.ok(Math.abs(result.x - EXPECTED_PAN_X_M) < TEST_TOLERANCE_M);
  assert.equal(result.z, 0);
  assert.equal(target.length(), 0);
});

test("editor keyboard pan normalizes diagonals and clamps to map bounds", () => {
  const target = new Vector3(EDIT_CENTER_M, 0, EDIT_CENTER_M);
  const moved = panEditorCamera(target, new Set(["KeyW", "KeyD"]), 0, EDIT_STEP_SEC, EDIT_WIDTH_M, EDIT_DEPTH_M);
  assert.ok(Math.abs(moved.distanceTo(target) - EXPECTED_EDIT_STEP_M) < TEST_TOLERANCE_M);
  const edge = new Vector3(EDIT_WIDTH_M, 0, 0);
  assert.deepEqual(panEditorCamera(edge, new Set(["KeyD"]), 0, EDIT_STEP_SEC, EDIT_WIDTH_M, EDIT_DEPTH_M), edge);
});

test("wheel events select campus ratio zoom or live-office distance zoom", () => {
  const campus = createCameraState(true);
  const event = cameraWheelEvent(campus, DRAG_PIXEL);
  assert.equal(event.type, "zoom");
  if (event.type === "zoom") assert.ok(event.ratio > campus.zoomRatio);
  const live = createCameraState(false);
  assert.deepEqual(cameraWheelEvent(live, DRAG_PIXEL), { type: "distance", distanceM: live.distanceM + LIVE_ZOOM_STEP_M });
});
