import type { AvatarPose } from "./avatarPoseSmoother";

export type Map2dAvatarMotion = "idle" | "walking" | "seated";
export type Map2dAvatarVisual = { motion: Map2dAvatarMotion; stridePhaseRad: number };
export type Map2dPlayer = AvatarPose & {
  displayName: string;
  isMaintainer?: boolean;
  username: string;
  status?: string;
  handRaised?: boolean;
  characterId?: string;
  sittingPropId?: string;
  vehicleId?: string;
  vehiclePropId?: string;
  vehiclePropX?: number;
  vehiclePropZ?: number;
  vehiclePropRotation?: number;
};
export type Map2dRenderedPlayer = Map2dPlayer & { visual: Map2dAvatarVisual };
export type Map2dAvatarStep = {
  previousX: number; previousZ: number; x: number; z: number;
  deltaS: number; sittingPropId?: string;
};
const WALK_MIN_SPEED_M_PER_S = 0.03;
const WALK_STRIDE_LENGTH_M = 1.6;
const WALK_MAX_CYCLES_PER_S = 1.5;
const FULL_CIRCLE_RAD = Math.PI * 2;

export function createMap2dAvatarVisual(sittingPropId?: string): Map2dAvatarVisual {
  return { motion: sittingPropId ? "seated" : "idle", stridePhaseRad: 0 };
}
/** Distance-driven gait never changes the authoritative pose or schedules idle redraws. */
export function advanceMap2dAvatarVisual(visual: Map2dAvatarVisual, step: Map2dAvatarStep): boolean {
  const distanceM = Math.hypot(step.x - step.previousX, step.z - step.previousZ);
  const walking = step.deltaS > 0 && distanceM / step.deltaS > WALK_MIN_SPEED_M_PER_S;
  const motion = step.sittingPropId ? "seated" : standingMotion(walking);
  const stridePhaseRad = motion === "walking"
    ? (visual.stridePhaseRad + Math.min(distanceM / WALK_STRIDE_LENGTH_M, step.deltaS * WALK_MAX_CYCLES_PER_S) * FULL_CIRCLE_RAD) % FULL_CIRCLE_RAD : 0;
  const changed = visual.motion !== motion || visual.stridePhaseRad !== stridePhaseRad;
  visual.motion = motion;
  visual.stridePhaseRad = stridePhaseRad;
  return changed;
}

function standingMotion(walking: boolean): Map2dAvatarMotion {
  return walking ? "walking" : "idle";
}
