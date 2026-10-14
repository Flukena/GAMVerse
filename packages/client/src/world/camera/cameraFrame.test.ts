import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { computeCameraFrame } from "./cameraFrame";
import { cameraWheelEvent } from "./cameraInput";
import { cameraReducer, createCameraState, type CameraState } from "./cameraState";

const FIT_DISTANCE_M = 500;
const ZOOM_DISTANCE_M = 70;
const TRANSITION_DISTANCE_M = 100;

function frameNear(state: CameraState) {
  return computeCameraFrame({
    state,
    localPosition: new Vector3(100, 0, 125),
    panTarget: new Vector3(100, 0, 125),
    width: 200,
    depth: 250,
    aspect: 1,
    yaw: 0,
    pitch: 0,
    campusFitDistanceM: FIT_DISTANCE_M,
  }).near;
}

test("orbiting, zooming and walking retain one 3D camera distance", () => {
  const ready = cameraReducer(createCameraState(true), { type: "avatar-ready" });
  const zoomed = cameraReducer(ready, { type: "distance", distanceM: ZOOM_DISTANCE_M, maxDistanceM: TRANSITION_DISTANCE_M });
  const detached = cameraReducer(zoomed, { type: "manual-drag" });
  assert.equal(detached.mode, "free");
  assert.equal(frameNear(detached), frameNear(zoomed));

  const wheel = cameraWheelEvent(detached, -1, TRANSITION_DISTANCE_M);
  assert.deepEqual(wheel, { type: "distance", distanceM: 60, maxDistanceM: TRANSITION_DISTANCE_M });
  const freeZoomed = cameraReducer(detached, wheel);
  const walking = cameraReducer(freeZoomed, { type: "walk-input" });
  assert.equal(walking.mode, "tpp");
  assert.equal(walking.distanceM, freeZoomed.distanceM);
  assert.equal(frameNear(walking), frameNear(freeZoomed));
});
