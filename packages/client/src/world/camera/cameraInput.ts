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

export function panCameraTarget(input: CameraPanInput): Vector3 {
  const { target, yawRad, distanceM, fovDeg, viewportHeightPixel, deltaXPixel, deltaYPixel } = input;
  const worldMPerPixel = 2 * distanceM * Math.tan(MathUtils.degToRad(fovDeg / 2)) / Math.max(viewportHeightPixel, MIN_CAMERA_VIEWPORT_HEIGHT_PIXEL);
  return target.clone().add(new Vector3(
    (-Math.cos(yawRad) * deltaXPixel - Math.sin(yawRad) * deltaYPixel) * worldMPerPixel,
    0,
    (Math.sin(yawRad) * deltaXPixel - Math.cos(yawRad) * deltaYPixel) * worldMPerPixel,
  ));
}

export function cameraWheelEvent(state: CameraState, deltaYPixel: number): CameraEvent {
  if (state.campus) return { type: "zoom", ratio: state.zoomRatio * Math.exp(deltaYPixel * CAMERA_WHEEL_SENSITIVITY_PER_PIXEL) };
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
