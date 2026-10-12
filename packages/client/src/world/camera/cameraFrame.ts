import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import type { CameraState } from "./cameraState";
import { computeCameraPose, type CameraPose } from "./cameraPose";
import { CAMERA_FAR_DISTANCE_RATIO, CAMERA_FAR_MIN_M, CAMERA_NEAR_DISTANCE_RATIO, CAMERA_NEAR_MAX_M, CAMPUS_FIT_MIN_ASPECT_RATIO, CAMPUS_FIT_PADDING_M, CAMPUS_FIT_TANGENT_RATIO, FPP_FOV_DEG, LOOK_TARGET_HEIGHT_M, SHOULDER_OFFSET_M, TPP_FOV_DEG } from "./constants";

export function campusOverviewDistance(width: number, depth: number, aspect: number, yaw: number, elevation: number, fovDegrees: number) {
  const verticalTangent = Math.tan(MathUtils.degToRad(fovDegrees / 2)) * CAMPUS_FIT_TANGENT_RATIO;
  const horizontalTangent = verticalTangent * Math.max(aspect, CAMPUS_FIT_MIN_ASPECT_RATIO);
  const direction = new Vector3(Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation));
  const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const up = new Vector3(-Math.sin(yaw) * Math.sin(elevation), Math.cos(elevation), -Math.cos(yaw) * Math.sin(elevation));
  let fitDistance = 0;
  for (const x of [-width / 2, width / 2]) {
    for (const z of [-depth / 2, depth / 2]) {
      const corner = new Vector3(x, 0, z);
      const cameraDepth = corner.dot(direction);
      fitDistance = Math.max(fitDistance, cameraDepth + Math.abs(corner.dot(right)) / horizontalTangent, cameraDepth + Math.abs(corner.dot(up)) / verticalTangent);
    }
  }
  return fitDistance + CAMPUS_FIT_PADDING_M;
}

type CameraFrameInput = {
  state: CameraState;
  localPosition?: Vector3;
  panTarget: Vector3;
  width: number;
  depth: number;
  aspect: number;
  yaw: number;
  pitch: number;
};
export type CameraFrame = { pose: CameraPose; focus: Vector3; mode: CameraState["mode"]; near: number; far: number };

export function computeCameraFrame(input: CameraFrameInput): CameraFrame {
  const { state, localPosition, panTarget, width, depth, aspect, yaw, pitch } = input;
  const mode = state.mode === "fpp" && !localPosition ? "tpp" : state.mode;
  const characterTarget = localPosition?.clone().add(new Vector3(0, LOOK_TARGET_HEIGHT_M, 0))
    ?? new Vector3(state.campus ? width / 2 : 0, 0, state.campus ? depth / 2 : 0);
  const focus = state.following ? characterTarget : panTarget;
  const fov = mode === "fpp" ? FPP_FOV_DEG : TPP_FOV_DEG;
  const distance = state.campus ? campusOverviewDistance(width, depth, aspect, yaw, state.elevationRad, fov) * state.zoomRatio : state.distanceM;
  const pose = computeCameraPose({
    mode, target: mode === "fpp" && localPosition ? localPosition : focus,
    yaw, pitch, elevation: state.elevationRad, distance,
    shoulderOffset: state.following && localPosition && !state.editing ? SHOULDER_OFFSET_M : 0,
  });
  return {
    pose, focus, mode,
    near: Math.max(Number.EPSILON, Math.min(CAMERA_NEAR_MAX_M, distance * CAMERA_NEAR_DISTANCE_RATIO)),
    far: Math.max(CAMERA_FAR_MIN_M, distance * CAMERA_FAR_DISTANCE_RATIO),
  };
}

export function applyCameraProjection(camera: PerspectiveCamera, frame: CameraFrame, campus: boolean): void {
  const near = campus ? frame.near : CAMERA_NEAR_MAX_M;
  const far = campus ? frame.far : CAMERA_FAR_MIN_M;
  if (camera.fov === frame.pose.fov && camera.near === near && camera.far === far) return;
  camera.fov = frame.pose.fov;
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
}
