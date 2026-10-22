import type { MovementInput } from "./inputDelivery.js";
import type { Position, WorldConfig } from "./worldTypes.js";
import { WORLD } from "./worldDefaults.js";
import { isPositionWalkable } from "./collision.js";

const MAX_MOVEMENT_AXIS_RATIO = 1;

export function isInsideMeetingZone(position: Position, wasInside = false, world: WorldConfig = WORLD): boolean {
  const radius = wasInside ? world.meetingZone.exitRadius : world.meetingZone.radius;
  return Math.hypot(position.x - world.meetingZone.x, position.z - world.meetingZone.z) <= radius;
}

export function arePlayersNearby(first: Position, second: Position): boolean {
  return Math.hypot(first.x - second.x, first.z - second.z) <= WORLD.proximityRadius;
}

export function movePlayer(
  position: Position,
  input: MovementInput,
  deltaSeconds: number,
  world: WorldConfig = WORLD,
): Position {
  const inputLength = Math.hypot(input.x, input.z);
  if (!Number.isFinite(inputLength) || inputLength === 0) return { ...position };

  const scale = Math.min(inputLength, MAX_MOVEMENT_AXIS_RATIO);
  const dx = (input.x / inputLength) * scale * world.movementSpeed * deltaSeconds;
  const dz = (input.z / inputLength) * scale * world.movementSpeed * deltaSeconds;
  const limitX = world.width / 2 - world.playerRadius;
  const limitZ = world.depth / 2 - world.playerRadius;

  // Subdivide large time steps so collision checks cannot skip over a thin wall.
  const distance = Math.hypot(dx, dz);
  const maxStep = world.playerRadius / 2;
  const steps = Math.max(1, Math.ceil(distance / maxStep));
  const stepX = dx / steps;
  const stepZ = dz / steps;
  let x = position.x;
  let z = position.z;

  for (let step = 0; step < steps; step += 1) {
    const nextX = Math.max(-limitX, Math.min(limitX, x + stepX));
    if (isPositionWalkable({ x: nextX, z }, world)) x = nextX;

    const nextZ = Math.max(-limitZ, Math.min(limitZ, z + stepZ));
    if (isPositionWalkable({ x, z: nextZ }, world)) z = nextZ;
  }

  return { x, z };
}

export function isValidMovementInput(value: unknown): value is MovementInput {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.x === "number" &&
    Number.isFinite(input.x) &&
    typeof input.z === "number" &&
    Number.isFinite(input.z) &&
    Math.abs(input.x) <= MAX_MOVEMENT_AXIS_RATIO &&
    Math.abs(input.z) <= MAX_MOVEMENT_AXIS_RATIO &&
    (input.sprint === undefined || typeof input.sprint === "boolean") &&
    (input.facingYaw === undefined || (typeof input.facingYaw === "number" && Number.isFinite(input.facingYaw)))
  );
}
