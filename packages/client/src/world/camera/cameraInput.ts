import { CAMERA } from "@gammyverse/shared";
import { MathUtils, Vector3 } from "three";
import type { CameraEvent, CameraState } from "./cameraState";
import { CAMERA_BACKWARD_KEY_CODES, CAMERA_FORWARD_KEY_CODES, CAMERA_LEFT_KEY_CODES, CAMERA_MOVEMENT_KEY_CODES, CAMERA_RIGHT_KEY_CODES, CAMERA_WHEEL_SENSITIVITY_PER_PIXEL, FPP_PITCH_LIMIT_DEG, MAP_EDIT_PAN_SPEED_M_PER_SEC, MIN_CAMERA_VIEWPORT_HEIGHT_PIXEL } from "./constants";

export function rotateFirstPersonAim(yawRad: number, pitchRad: number, deltaXPixel: number, deltaYPixel: number, sensitivityRadPerPixel: number) {
  const limitRad = MathUtils.degToRad(FPP_PITCH_LIMIT_DEG);
  return {
    yawRad: yawRad - deltaXPixel * sensitivityRadPerPixel,
    pitchRad: MathUtils.clamp(pitchRad - deltaYPixel * sensitivityRadPerPixel, -limitRad, limitRad),
  };
}

type CameraPanInput = {
  target: Vector3;
  yawRad: number;
  distanceM: number;
  fovDeg: number;
  viewportHeightPixel: number;
  deltaXPixel: number;
  deltaYPixel: number;
};

export function hasExceededCameraDragThreshold(startX: number, startY: number, x: number, y: number, thresholdPx: number): boolean {
  return Math.hypot(x - startX, y - startY) >= thresholdPx;
}

export function isCameraClickGesture(startX: number, startY: number, x: number, y: number, dragThresholdPx: number): boolean {
  return Math.hypot(x - startX, y - startY) < dragThresholdPx;
}

export type CampusMapPointerAction = "drag-map" | "select-player" | "automove" | "ignore";

export type CameraPointerGestureIdentity = { pointerId: number; button: number; cancelled: boolean };

/** A gesture belongs to the exact pointer and button that started it. */
export function isConflictingCameraPointerDown(gesture: CameraPointerGestureIdentity, pointerId: number, button: number): boolean {
  return gesture.pointerId !== pointerId || gesture.button !== button;
}

/** Only the matching button release may finish an active camera gesture. */
export function canFinishCameraPointerGesture(
  gesture: CameraPointerGestureIdentity,
  pointerId: number,
  button: number,
  buttonsStillDown: number,
): boolean {
  return !gesture.cancelled && gesture.pointerId === pointerId && gesture.button === button && buttonsStillDown === 0;
}

export function classifyCampusMapPointerAction(button: number, movementPx: number, dragThresholdPx: number, playerSessionId: string | null): CampusMapPointerAction {
  if (button !== 0) return "ignore";
  if (movementPx >= dragThresholdPx) return "drag-map";
  return playerSessionId ? "select-player" : "automove";
}

export function findClosestScreenTarget<T extends { id: string; x: number; y: number }>(targets: readonly T[], x: number, y: number, maxDistancePx: number): string | null {
  let closestId: string | null = null;
  let closestDistance = maxDistancePx;
  for (const target of targets) {
    const distance = Math.hypot(x - target.x, y - target.y);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestId = target.id;
    }
  }
  return closestId;
}

export function panCameraTarget(input: CameraPanInput): Vector3 {
  const { target, yawRad, distanceM, fovDeg, viewportHeightPixel, deltaXPixel, deltaYPixel } = input;
  const worldMPerPixel = 2 * distanceM * Math.tan(MathUtils.degToRad(fovDeg / 2)) / Math.max(viewportHeightPixel, MIN_CAMERA_VIEWPORT_HEIGHT_PIXEL);
  return target.clone().add(new Vector3(
    (-Math.cos(yawRad) * deltaXPixel - Math.sin(yawRad) * deltaYPixel) * worldMPerPixel,
    0,
    (Math.sin(yawRad) * deltaXPixel - Math.cos(yawRad) * deltaYPixel) * worldMPerPixel,
  ));
}

export function cameraPanDistanceM(state: CameraState, campusFitDistanceM: number): number {
  return state.campus && (state.mode === "map2d" || state.editing)
    ? campusFitDistanceM * state.zoomRatio
    : state.distanceM;
}

export function cameraWheelEvent(state: CameraState, deltaYPixel: number, maxDistanceM: number = CAMERA.maxZoom): CameraEvent {
  if (state.campus && (state.mode === "tpp" || state.mode === "free" && !state.editing) && state.arrival === "ready") {
    const distanceM = state.distanceM + Math.sign(deltaYPixel) * CAMERA.zoomStep;
    return { type: "distance", distanceM, maxDistanceM };
  }
  if (state.campus) {
    const ratio = state.zoomRatio * Math.exp(deltaYPixel * CAMERA_WHEEL_SENSITIVITY_PER_PIXEL);
    return { type: "zoom", ratio };
  }
  return { type: "distance", distanceM: state.distanceM + Math.sign(deltaYPixel) * CAMERA.zoomStep };
}

function anyKeyPressed(keys: ReadonlySet<string>, codes: readonly string[]): boolean {
  return codes.some((code) => keys.has(code));
}

export function hasCameraMovement(keys: ReadonlySet<string>): boolean {
  return anyKeyPressed(keys, CAMERA_MOVEMENT_KEY_CODES);
}

function keyboardPanDirection(keys: ReadonlySet<string>) {
  const right = Number(anyKeyPressed(keys, CAMERA_RIGHT_KEY_CODES)) - Number(anyKeyPressed(keys, CAMERA_LEFT_KEY_CODES));
  const forward = Number(anyKeyPressed(keys, CAMERA_FORWARD_KEY_CODES)) - Number(anyKeyPressed(keys, CAMERA_BACKWARD_KEY_CODES));
  return { right, forward, magnitude: Math.hypot(right, forward) };
}

export function panEditorCamera(target: Vector3, keys: ReadonlySet<string>, yawRad: number, deltaSec: number, widthM: number, depthM: number): Vector3 {
  const { right, forward, magnitude } = keyboardPanDirection(keys);
  if (magnitude === 0) return target.clone();
  const stepM = MAP_EDIT_PAN_SPEED_M_PER_SEC * deltaSec / magnitude;
  return new Vector3(
    MathUtils.clamp(target.x + (right * Math.cos(yawRad) - forward * Math.sin(yawRad)) * stepM, 0, widthM),
    target.y,
    MathUtils.clamp(target.z + (-right * Math.sin(yawRad) - forward * Math.cos(yawRad)) * stepM, 0, depthM),
  );
}

export function cameraZoomButtonEvent(state: CameraState, factor: number): CameraEvent {
  return state.view === "2d" ? { type: "map2d-scale", pxPerM: state.map2dScalePxPerM * factor } : { type: "zoom", ratio: state.zoomRatio / factor };
}
