import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { computeCameraPose, smoothCameraPose, type CameraPose, type CameraSmoothing } from "./cameraPose";

const TOLERANCE_M = 1e-9;
const POSE_DISTANCE_M = 10;
const ORBIT_ELEVATION_RAD = Math.PI / 6;
const HALF_TURN_RAD = Math.PI;
const QUARTER_TURN_RAD = Math.PI / 2;
const STEP_SEC = 1 / 60;
const CONVERGENCE_STEPS_COUNT = 300;
const DISPLACEMENT_M = 5;
const EXPECTED_EYE_HEIGHT_M = 1.42;
const EXPECTED_TPP_FOV_DEG = 38;
const EXPECTED_FPP_FOV_DEG = 68;
const CONTINUOUS: CameraSmoothing = { reduceMotion: false, modeChanged: false, roomChanged: false };

const SHOULDER_OFFSET_M = 0.68;
const SHOULDER_AIM_OFFSET_M = 0.374;

const WRAP_START_RAD = 3.1;
const WRAP_END_RAD = -3.1;

function pose(yaw = 0, target = new Vector3()): CameraPose {
  return computeCameraPose({ mode: "tpp", target, yaw, pitch: 0, elevation: ORBIT_ELEVATION_RAD, distance: POSE_DISTANCE_M, shoulderOffset: 0 });
}

function closeVector(actual: Vector3, expected: Vector3) {
  assert.ok(actual.distanceTo(expected) < TOLERANCE_M);
}

test("TPP preserves the established elevated rear geometry; FPP uses eye height", () => {
  const rear = pose();
  closeVector(rear.position, new Vector3(0, Math.tan(ORBIT_ELEVATION_RAD) * POSE_DISTANCE_M, Math.cos(ORBIT_ELEVATION_RAD) * POSE_DISTANCE_M));
  assert.equal(rear.fov, EXPECTED_TPP_FOV_DEG);
  closeVector(pose(QUARTER_TURN_RAD).position, new Vector3(Math.cos(ORBIT_ELEVATION_RAD) * POSE_DISTANCE_M, Math.tan(ORBIT_ELEVATION_RAD) * POSE_DISTANCE_M, 0));
  const target = new Vector3(DISPLACEMENT_M, 0, DISPLACEMENT_M);
  const eye = computeCameraPose({ mode: "fpp", target, yaw: 0, pitch: 0, elevation: 0, distance: POSE_DISTANCE_M, shoulderOffset: 0 });
  closeVector(eye.position, new Vector3(DISPLACEMENT_M, EXPECTED_EYE_HEIGHT_M, DISPLACEMENT_M));
  closeVector(eye.lookAt.clone().sub(eye.position), new Vector3(0, 0, -1));
  assert.equal(eye.fov, EXPECTED_FPP_FOV_DEG);
  closeVector(target, new Vector3(DISPLACEMENT_M, 0, DISPLACEMENT_M));
});

test("smoothing moves the look target gradually and converges to the desired pose", () => {
  const initial = pose();
  const desired = pose(QUARTER_TURN_RAD, new Vector3(DISPLACEMENT_M, 0, 0));
  let current = smoothCameraPose(initial, desired, STEP_SEC, CONTINUOUS);
  assert.ok(current.lookAt.x > 0 && current.lookAt.x < desired.lookAt.x);
  for (let step = 0; step < CONVERGENCE_STEPS_COUNT; step += 1) current = smoothCameraPose(current, desired, STEP_SEC, CONTINUOUS);
  closeVector(current.position, desired.position);
  closeVector(current.lookAt, desired.lookAt);
});

test("one double-duration step matches two steps for a fixed desired pose", () => {
  const initial = pose();
  const desired = pose(QUARTER_TURN_RAD, new Vector3(DISPLACEMENT_M, DISPLACEMENT_M, 0));
  const whole = smoothCameraPose(initial, desired, STEP_SEC * 2, CONTINUOUS);
  const half = smoothCameraPose(initial, desired, STEP_SEC, CONTINUOUS);
  const twice = smoothCameraPose(half, desired, STEP_SEC, CONTINUOUS);
  closeVector(whole.position, twice.position);
  closeVector(whole.lookAt, twice.lookAt);
});

test("first frame, reduced motion, mode change and room change snap exactly", () => {
  const desired = pose(QUARTER_TURN_RAD);
  const cases: Array<{ previous: CameraPose | null; smoothing: CameraSmoothing }> = [
    { previous: null, smoothing: CONTINUOUS },
    { previous: pose(), smoothing: { ...CONTINUOUS, reduceMotion: true } },
    { previous: pose(), smoothing: { ...CONTINUOUS, modeChanged: true } },
    { previous: pose(), smoothing: { ...CONTINUOUS, roomChanged: true } },
  ];
  for (const entry of cases) {
    const snapped = smoothCameraPose(entry.previous, desired, STEP_SEC, entry.smoothing);
    closeVector(snapped.position, desired.position);
    closeVector(snapped.lookAt, desired.lookAt);
  }
});

test("interpolated half-turn keeps orbit radius rather than cutting a chord", () => {
  const initial = pose();
  const desired = pose(HALF_TURN_RAD);
  const radiusM = initial.position.distanceTo(initial.lookAt);
  let current = initial;
  for (let step = 0; step < CONVERGENCE_STEPS_COUNT; step += 1) {
    current = smoothCameraPose(current, desired, STEP_SEC, CONTINUOUS);
    assert.ok(Math.abs(current.position.distanceTo(current.lookAt) - radiusM) < TOLERANCE_M);
  }
});

test("zero elapsed time preserves the prior pose without mutating inputs", () => {
  const initial = pose();
  const saved = initial.position.clone();
  const current = smoothCameraPose(initial, pose(QUARTER_TURN_RAD), 0, CONTINUOUS);
  closeVector(current.position, saved);
  closeVector(initial.position, saved);
});

test("TPP shoulder offsets preserve the established camera and aim framing", () => {
  const target = new Vector3(DISPLACEMENT_M, 0, 0);
  const shoulder = computeCameraPose({ mode: "tpp", target, yaw: 0, pitch: 0, elevation: ORBIT_ELEVATION_RAD, distance: POSE_DISTANCE_M, shoulderOffset: SHOULDER_OFFSET_M });
  assert.ok(Math.abs(shoulder.position.x - target.x - SHOULDER_OFFSET_M) < TOLERANCE_M);
  assert.ok(Math.abs(shoulder.lookAt.x - target.x - SHOULDER_AIM_OFFSET_M) < TOLERANCE_M);
});

test("orbit smoothing takes the short path across the yaw wrap", () => {
  const smoothed = smoothCameraPose(pose(WRAP_START_RAD), pose(WRAP_END_RAD), STEP_SEC, CONTINUOUS);
  const offset = smoothed.position.clone().sub(smoothed.lookAt);
  assert.ok(offset.z < 0);
  assert.ok(Math.abs(offset.x) < offset.length() / POSE_DISTANCE_M);
});
