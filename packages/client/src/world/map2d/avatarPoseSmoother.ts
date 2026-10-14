import { lerpAngle } from "@gammyverse/shared";
export type AvatarPose = { x: number; z: number; rotation: number };
const AVATAR_LOCAL_RESPONSIVENESS_RATIO = 0.38;
const AVATAR_REMOTE_RESPONSIVENESS_RATIO = 0.16;
const AVATAR_REFERENCE_FRAMERATE_HZ = 60;
const AVATAR_SETTLED_POSITION_M = 0.001;
const AVATAR_SETTLED_ANGLE_RAD = 0.001;
export function avatarPoseBlend(deltaS: number, local: boolean): number {
  return (
    1 -
    Math.pow(
      1 -
        (local
          ? AVATAR_LOCAL_RESPONSIVENESS_RATIO
          : AVATAR_REMOTE_RESPONSIVENESS_RATIO),
      Math.max(0, deltaS) * AVATAR_REFERENCE_FRAMERATE_HZ,
    )
  );
}
export function smoothAvatarPose(
  current: AvatarPose,
  target: AvatarPose,
  deltaS: number,
  local: boolean,
): AvatarPose {
  const blend = avatarPoseBlend(deltaS, local);
  return {
    x: current.x + (target.x - current.x) * blend,
    z: current.z + (target.z - current.z) * blend,
    rotation: lerpAngle(current.rotation, target.rotation, blend),
  };
}
export function isPoseSettled(
  current: AvatarPose,
  target: AvatarPose,
): boolean {
  return (
    Math.hypot(current.x - target.x, current.z - target.z) <=
      AVATAR_SETTLED_POSITION_M &&
    Math.abs(
      Math.atan2(
        Math.sin(current.rotation - target.rotation),
        Math.cos(current.rotation - target.rotation),
      ),
    ) <= AVATAR_SETTLED_ANGLE_RAD
  );
}
