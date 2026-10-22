import type { MovementInput } from "./inputDelivery.js";

export const CAMERA = {
  offsetX: 8.5,
  offsetY: 10.5,
  offsetZ: 12.5,
  dragSensitivity: 0.006,
  zoomStep: 10,
  minZoom: 15,
  maxZoom: 35,
} as const;

export const DEFAULT_CAMERA_YAW = Math.atan2(CAMERA.offsetX, CAMERA.offsetZ);

/** Converts screen-relative input (right and forward) into world-relative movement. */
export function screenMovementToWorld(input: MovementInput, cameraYaw: number): MovementInput {
  if (!Number.isFinite(input.x) || !Number.isFinite(input.z) || !Number.isFinite(cameraYaw)) {
    return { x: 0, z: 0 };
  }

  const length = Math.hypot(input.x, input.z);
  if (length === 0) return { x: 0, z: 0 };
  const scale = Math.min(length, 1) / length;
  const right = input.x * scale;
  const forward = input.z * scale;
  const cosYaw = Math.cos(cameraYaw);
  const sinYaw = Math.sin(cameraYaw);
  return {
    x: right * cosYaw - forward * sinYaw,
    z: -right * sinYaw - forward * cosYaw,
  };
}
