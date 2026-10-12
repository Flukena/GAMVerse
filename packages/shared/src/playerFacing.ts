import { shortestAngleDelta } from "./angles.js";
import type { MovementInput } from "./inputDelivery.js";

interface PlayerFacingState {
  input: MovementInput;
  seated: boolean;
  inVehicle: boolean;
  currentRotation: number;
}

/** Orientation only: callers retain authority over position and seat transitions. */
export function resolvePlayerFacing({ input, seated, inVehicle, currentRotation }: PlayerFacingState): number {
  if (seated) return currentRotation;
  if (!inVehicle && input.facingYaw !== undefined) return shortestAngleDelta(0, input.facingYaw);
  if (input.x !== 0 || input.z !== 0) return Math.atan2(input.x, input.z);
  return currentRotation;
}
