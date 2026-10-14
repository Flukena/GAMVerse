import { screenMovementToWorld, shortestAngleDelta, type MovementInput } from "@gammyverse/shared";

export const CHARACTER_TURN_STEP_RAD = Math.PI / 12;
export const CHARACTER_TURN_REPEAT_MS = 200;
const TURN_INTENT_HOLD_MS = 1000;

export type LockedTurnState = {
  rotationRad: number;
  direction: -1 | 0 | 1;
  lastStepAtMs: number;
};

/** In this world +X is to the avatar's left when facing +Z. */
export function advanceLockedTurn(state: LockedTurnState | null, direction: -1 | 0 | 1, currentRotationRad: number, nowMs: number): LockedTurnState | null {
  if (direction === 0) return state ? { ...state, direction: 0 } : null;
  if (state?.direction === direction && nowMs - state.lastStepAtMs < CHARACTER_TURN_REPEAT_MS) return state;
  const rotationRad = state && nowMs - state.lastStepAtMs < TURN_INTENT_HOLD_MS ? state.rotationRad : currentRotationRad;
  return { rotationRad: shortestAngleDelta(0, rotationRad - direction * CHARACTER_TURN_STEP_RAD), direction, lastStepAtMs: nowMs };
}

export function recentLockedRotation(state: LockedTurnState | null, nowMs: number): number | null {
  return state && nowMs - state.lastStepAtMs < TURN_INTENT_HOLD_MS ? state.rotationRad : null;
}

/** Resolve tank-style input while the camera stays behind the character. */
export function lockedMovementInput(
  forward: number,
  currentRotationRad: number,
  heldRotationRad: number | null,
  sprint: boolean,
): MovementInput {
  const rotationRad = heldRotationRad ?? currentRotationRad;
  const movement = screenMovementToWorld({ x: 0, z: forward }, rotationRad + Math.PI);
  return { ...movement, sprint, facingYaw: rotationRad };
}
