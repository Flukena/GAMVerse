import { screenMovementToWorld, type MovementInput } from "@gammyverse/shared";
import { MAP2D_SCREEN_YAW_RAD } from "../map2d/constants";
import { advanceLockedTurn, lockedMovementInput, recentLockedRotation, type LockedTurnState } from "./lockedMovement";

export type HeldMovementFrame = {
  keys: ReadonlySet<string>;
  map2d: boolean;
  firstPerson: boolean;
  behindCharacter: boolean;
  cameraYawRad: number;
  playerRotationRad?: number;
  driving: boolean;
  nowMs: number;
  lockedTurn: LockedTurnState | null;
};
type HeldDirection = { right: -1 | 0 | 1; forward: number; sprint: boolean };

function axis(negative: boolean, positive: boolean): -1 | 0 | 1 {
  if (negative === positive) return 0;
  return positive ? 1 : -1;
}

function heldDirection(keys: ReadonlySet<string>): HeldDirection {
  const left = keys.has("KeyA") || keys.has("ArrowLeft");
  const right = keys.has("KeyD") || keys.has("ArrowRight");
  return {
    right: axis(left, right),
    forward: Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown")),
    sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
  };
}

function lockedIntent(frame: HeldMovementFrame, direction: HeldDirection) {
  const rotationRad = frame.playerRotationRad ?? frame.cameraYawRad + Math.PI;
  const lockedTurn = advanceLockedTurn(frame.lockedTurn, direction.right, rotationRad, frame.nowMs);
  const recentTurn = recentLockedRotation(lockedTurn, frame.nowMs);
  const moving = direction.right !== 0 || direction.forward !== 0 || recentTurn !== null;
  const input: MovementInput = moving
    ? lockedMovementInput(direction.forward, rotationRad, recentTurn, direction.sprint)
    : { x: 0, z: 0, sprint: false };
  return { input, lockedTurn };
}

export function resolveHeldMovement(frame: HeldMovementFrame): { input: MovementInput; lockedTurn: LockedTurnState | null } {
  const direction = heldDirection(frame.keys);
  if (!frame.map2d && frame.behindCharacter && !frame.firstPerson && !frame.driving) return lockedIntent(frame, direction);
  const yawRad = frame.map2d ? MAP2D_SCREEN_YAW_RAD : frame.cameraYawRad;
  return {
    input: { ...screenMovementToWorld({ x: direction.right, z: direction.forward }, yawRad), sprint: direction.sprint, facingYaw: frame.firstPerson ? frame.cameraYawRad + Math.PI : undefined },
    lockedTurn: null,
  };
}
