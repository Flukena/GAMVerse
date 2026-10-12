import assert from "node:assert/strict";
import test from "node:test";
import { cameraReducer, createCameraState } from "./cameraState";
import { CAMPUS_2D_ZOOM_THRESHOLD_RATIO, CAMPUS_MIN_ZOOM_RATIO, DEFAULT_TPP_ELEVATION_RAD, LIVE_OFFICE_FOCUS_DISTANCE_M } from "./constants";

const FREE_ZOOM_RATIO = CAMPUS_2D_ZOOM_THRESHOLD_RATIO / 2;
const CUSTOM_DISTANCE_M = 20;

function readyState() {
  return cameraReducer(createCameraState(true), { type: "avatar-ready" });
}

test("manual drag detaches; walking resumes TPP follow", () => {
  const free = cameraReducer(readyState(), { type: "manual-drag" });
  assert.equal(free.mode, "free");
  assert.equal(free.following, false);
  const walking = cameraReducer(free, { type: "walk-input" });
  assert.equal(walking.mode, "tpp");
  assert.equal(walking.following, true);
});

test("walking preserves FPP, map2d, and editing views", () => {
  const ready = readyState();
  const protectedStates = [
    cameraReducer(ready, { type: "toggle-fpp" }),
    cameraReducer(ready, { type: "zoom", ratio: CAMPUS_2D_ZOOM_THRESHOLD_RATIO }),
    cameraReducer(ready, { type: "edit", active: true }),
  ];
  for (const state of protectedStates) assert.deepEqual(cameraReducer(state, { type: "walk-input" }), state);
});

test("leaving FPP restores close TPP framing", () => {
  const fpp = cameraReducer(readyState(), { type: "toggle-fpp" });
  const distant = cameraReducer(fpp, { type: "distance", distanceM: CUSTOM_DISTANCE_M });
  const tpp = cameraReducer(distant, { type: "toggle-fpp" });
  assert.equal(tpp.mode, "tpp");
  assert.equal(tpp.following, true);
  assert.equal(tpp.distanceM, LIVE_OFFICE_FOCUS_DISTANCE_M);
  assert.equal(tpp.zoomRatio, CAMPUS_MIN_ZOOM_RATIO);
  assert.equal(tpp.elevationRad, DEFAULT_TPP_ELEVATION_RAD);
});

test("zoom crosses the 2D threshold and returns to the detached view", () => {
  const free = cameraReducer(readyState(), { type: "manual-drag" });
  const map = cameraReducer(free, { type: "zoom", ratio: CAMPUS_2D_ZOOM_THRESHOLD_RATIO });
  assert.equal(map.mode, "map2d");
  assert.equal(cameraReducer(map, { type: "zoom", ratio: FREE_ZOOM_RATIO }).mode, "free");
});

test("editing exits FPP, rejects FPP toggle, and does not auto-follow on exit", () => {
  const fpp = cameraReducer(readyState(), { type: "toggle-fpp" });
  const editing = cameraReducer(fpp, { type: "edit", active: true });
  assert.equal(editing.mode, "free");
  assert.equal(cameraReducer(editing, { type: "toggle-fpp" }), editing);
  const exited = cameraReducer(editing, { type: "edit", active: false });
  assert.equal(exited.mode, "free");
  assert.equal(exited.following, false);
});

test("room arrival resets FPP and awaits avatar alignment; editing arrival stays detached", () => {
  const fpp = cameraReducer(readyState(), { type: "toggle-fpp" });
  const arrival = cameraReducer(fpp, { type: "room-change", campus: false, alignBehind: true });
  assert.equal(arrival.mode, "tpp");
  assert.equal(arrival.arrival, "awaiting-avatar");
  assert.equal(arrival.campus, false);
  const editing = cameraReducer(arrival, { type: "edit", active: true });
  const ready = cameraReducer(editing, { type: "avatar-ready" });
  assert.equal(ready.mode, "free");
  assert.equal(ready.following, false);
});

test("room arrival while walking keeps the current yaw instead of aligning behind", () => {
  const walkingArrival = cameraReducer(readyState(), { type: "room-change", campus: false, alignBehind: false });
  assert.equal(walkingArrival.arrival, "awaiting-avatar");
  assert.equal(walkingArrival.alignBehind, false);
  assert.equal(cameraReducer(readyState(), { type: "room-change", campus: false, alignBehind: true }).alignBehind, true);
});

test("character focus preserves FPP instead of desynchronizing its mode", () => {
  const fpp = cameraReducer(readyState(), { type: "toggle-fpp" });
  assert.equal(cameraReducer(fpp, { type: "focus-character" }).mode, "fpp");
});
