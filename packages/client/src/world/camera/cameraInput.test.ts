import assert from "node:assert/strict";
import test from "node:test";
import { CAMERA } from "@gammyverse/shared";
import { MathUtils, Vector3 } from "three";
import { cameraReducer, createCameraState } from "./cameraState";
import { rotateFirstPersonAim, panCameraTarget, cameraPanDistanceM, hasExceededCameraDragThreshold, isCameraClickGesture, classifyCampusMapPointerAction, findClosestScreenTarget, cameraWheelEvent, cameraZoomButtonEvent, panEditorCamera, isConflictingCameraPointerDown, canFinishCameraPointerGesture } from "./cameraInput";
import { CAMPUS_MAX_ZOOM_RATIO, FPP_POINTER_SENSITIVITY_RAD_PER_PIXEL } from "./constants";

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
const LIVE_ZOOM_STEP_M = 10;


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

test("3D map panning uses the actual camera distance while 2D uses map zoom", () => {
  const state = createCameraState(true);
  assert.equal(cameraPanDistanceM({ ...state, distanceM: 42 }, 300), 42);
  assert.equal(cameraPanDistanceM({ ...state, mode: "map2d", zoomRatio: 0.25 }, 300), 75);
});

test("camera gesture separates small pointer jitter from a drag at the same threshold", () => {
  assert.equal(hasExceededCameraDragThreshold(10, 10, 15, 10, 6), false);
  assert.equal(hasExceededCameraDragThreshold(10, 10, 16, 10, 6), true);
  assert.equal(hasExceededCameraDragThreshold(10, 10, 14, 15, 6), true);
});

test("map clicks and drags use one threshold with no dead zone", () => {
  assert.equal(isCameraClickGesture(10, 10, 15, 10, 6), true);
  assert.equal(hasExceededCameraDragThreshold(10, 10, 15, 10, 6), false);
  assert.equal(isCameraClickGesture(10, 10, 16, 10, 6), false);
  assert.equal(hasExceededCameraDragThreshold(10, 10, 16, 10, 6), true);
  // Normal hand jitter below 10 CSS pixels remains a click; a clear drag
  // starts panning at the same boundary.
  assert.equal(isCameraClickGesture(10, 10, 19, 10, 10), true);
  assert.equal(hasExceededCameraDragThreshold(10, 10, 20, 10, 10), true);
});

test("campus map separates drag, player selection, and automove", () => {
  assert.equal(classifyCampusMapPointerAction(0, 0, 6, "player-1"), "select-player");
  assert.equal(classifyCampusMapPointerAction(0, 0, 6, null), "automove");
  assert.equal(classifyCampusMapPointerAction(0, 6, 6, "player-1"), "drag-map");
  assert.equal(classifyCampusMapPointerAction(2, 0, 6, null), "ignore");
  assert.equal(findClosestScreenTarget([{ id: "far", x: 20, y: 20 }, { id: "near", x: 3, y: 4 }], 0, 0, 10), "near");
  assert.equal(findClosestScreenTarget([{ id: "far", x: 20, y: 20 }], 0, 0, 10), null);
});

test("camera gesture stays with its initiating pointer and button", () => {
  const gesture = { pointerId: 7, button: 0, cancelled: false };
  assert.equal(isConflictingCameraPointerDown(gesture, 7, 2), true);
  assert.equal(isConflictingCameraPointerDown(gesture, 8, 0), true);
  assert.equal(isConflictingCameraPointerDown(gesture, 7, 0), false);
  assert.equal(canFinishCameraPointerGesture(gesture, 7, 2, 0), false);
  assert.equal(canFinishCameraPointerGesture(gesture, 7, 0, 2), false);
  assert.equal(canFinishCameraPointerGesture(gesture, 7, 0, 0), true);
  gesture.cancelled = true;
  assert.equal(canFinishCameraPointerGesture(gesture, 7, 0, 0), false);
});

test("ten alternating map clicks and drags remain separate", () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(classifyCampusMapPointerAction(0, 0, 10, null), "automove", `click ${attempt + 1}`);
    assert.equal(classifyCampusMapPointerAction(0, 24, 10, null), "drag-map", `drag ${attempt + 1}`);
  }
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

test("map2d zoom controls change independent scale instead of 3D framing", () => {
  const state = { ...createCameraState(true), mode: "map2d" as const, view: "2d" as const };
  assert.deepEqual(cameraZoomButtonEvent(state, 2), { type: "map2d-scale", pxPerM: state.map2dScalePxPerM * 2 });
});

const ZOOM_IN_FACTOR = 2;
const CAMPUS_MAX_DISTANCE_M = 60;
const REPEATED_ZOOM_STEPS_COUNT = 20;
test("wheel zoom clamps at the 3D distance limit without changing mode", () => {
  const ready = cameraReducer(createCameraState(true), { type: "avatar-ready" });
  for (const initial of [ready, cameraReducer(ready, { type: "manual-drag" })]) {
    let state = initial;
    for (let step = 0; step < REPEATED_ZOOM_STEPS_COUNT; step += 1) {
      const event = cameraWheelEvent(state, DRAG_PIXEL, CAMPUS_MAX_DISTANCE_M);
      assert.equal(event.type, "distance");
      state = cameraReducer(state, event);
      assert.equal(state.view, "3d");
      assert.equal(state.mode, initial.mode);
    }
    assert.equal(state.distanceM, CAMPUS_MAX_DISTANCE_M);
  }
});

test("2D wheel and button zoom stay in 2D until an explicit mode switch", () => {
  const map = cameraReducer(cameraReducer(createCameraState(true), { type: "avatar-ready" }), { type: "set-view", view: "2d" });
  const zoomed = { ...map, zoomRatio: CAMPUS_MAX_ZOOM_RATIO };
  for (const event of [cameraWheelEvent(map, -LARGE_DRAG_PIXEL), cameraZoomButtonEvent(zoomed, ZOOM_IN_FACTOR)]) {
    const state = cameraReducer(map, event);
    assert.equal(state.view, "2d");
    assert.equal(state.mode, "map2d");
  }
});
