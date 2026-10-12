import { lerpAngle } from "@gammyverse/shared";
import { MathUtils, Vector3 } from "three";
import type { CameraMode } from "./cameraState";
import { FPP_EYE_HEIGHT_M, FPP_FOV_DEG, POSITION_RETAINED_PER_FRAME, SHOULDER_LOOK_RATIO, SMOOTHING_REFERENCE_FPS, TPP_FOV_DEG } from "./constants";

export type CameraPose = { position: Vector3; lookAt: Vector3; fov: number };
export type CameraPoseInput = {
  mode: CameraMode;
  target: Vector3;
  yaw: number;
  pitch: number;
  elevation: number;
  distance: number;
  shoulderOffset: number;
};

export function computeCameraPose(input: CameraPoseInput): CameraPose {
  const { mode, target, yaw, pitch, elevation, distance, shoulderOffset } = input;
  if (mode === "fpp") {
    const position = target.clone().add(new Vector3(0, FPP_EYE_HEIGHT_M, 0));
    const forward = new Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    return { position, lookAt: position.clone().add(forward), fov: FPP_FOV_DEG };
  }
  const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const horizontalDistance = distance * Math.cos(elevation);
  const position = new Vector3(
    target.x + Math.sin(yaw) * horizontalDistance,
    target.y + Math.tan(elevation) * distance,
    target.z + Math.cos(yaw) * horizontalDistance,
  ).addScaledVector(right, shoulderOffset);
  return { position, lookAt: target.clone().addScaledVector(right, shoulderOffset * SHOULDER_LOOK_RATIO), fov: TPP_FOV_DEG };
}

export type CameraSmoothing = { reduceMotion: boolean; modeChanged: boolean; roomChanged: boolean };

export function cameraSmoothingFactor(deltaSec: number): number {
  return 1 - Math.pow(POSITION_RETAINED_PER_FRAME, Math.max(0, deltaSec) * SMOOTHING_REFERENCE_FPS);
}

function orbitCoordinates(pose: CameraPose) {
  const offset = pose.position.clone().sub(pose.lookAt);
  return {
    radiusM: offset.length(),
    yawRad: Math.atan2(offset.x, offset.z),
    elevationRad: Math.atan2(offset.y, Math.hypot(offset.x, offset.z)),
  };
}

export function smoothCameraPose(previous: CameraPose | null, desired: CameraPose, deltaSec: number, smoothing: CameraSmoothing): CameraPose {
  if (!previous || smoothing.reduceMotion || smoothing.modeChanged || smoothing.roomChanged) {
    return { position: desired.position.clone(), lookAt: desired.lookAt.clone(), fov: desired.fov };
  }
  const blend = cameraSmoothingFactor(deltaSec);
  const from = orbitCoordinates(previous);
  const to = orbitCoordinates(desired);
  const radiusM = MathUtils.lerp(from.radiusM, to.radiusM, blend);
  const yawRad = lerpAngle(from.yawRad, to.yawRad, blend);
  const elevationRad = MathUtils.lerp(from.elevationRad, to.elevationRad, blend);
  const lookAt = previous.lookAt.clone().lerp(desired.lookAt, blend);
  const horizontalM = radiusM * Math.cos(elevationRad);
  const offset = new Vector3(Math.sin(yawRad) * horizontalM, radiusM * Math.sin(elevationRad), Math.cos(yawRad) * horizontalM);
  return { position: lookAt.clone().add(offset), lookAt, fov: desired.fov };
}
