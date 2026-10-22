import { WORLD } from "./worldDefaults.js";
import type { Blocker, BlockerGrid, Position, WorldConfig } from "./worldTypes.js";

function overlapsAnyBlocker(position: Position, blockers: readonly Blocker[], world: WorldConfig): boolean {
  for (const blocker of blockers) {
    if (world.excludedVehiclePropId && blocker.vehiclePropId === world.excludedVehiclePropId) continue;
    if (overlapsBlocker(position.x, position.z, blocker, world.playerRadius)) return true;
  }
  return false;
}

function overlapsGrid(position: Position, grid: BlockerGrid, world: WorldConfig): boolean {
  const radius = world.playerRadius;
  const minX = Math.floor((position.x - radius) / grid.cellSize);
  const maxX = Math.floor((position.x + radius) / grid.cellSize);
  const minZ = Math.floor((position.z - radius) / grid.cellSize);
  const maxZ = Math.floor((position.z + radius) / grid.cellSize);
  for (let cellX = minX; cellX <= maxX; cellX += 1) {
    for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
      const blockers = grid.cells.get(`${cellX},${cellZ}`);
      if (blockers && overlapsAnyBlocker(position, blockers, world)) return true;
    }
  }
  return false;
}

function hasNearbyBlocker(position: Position, world: WorldConfig): boolean {
  if (!world.collisionGrid && (overlapsAnyBlocker(position, world.walls, world) || overlapsAnyBlocker(position, world.obstacles, world))) return true;
  for (const grid of [world.collisionGrid, world.dynamicCollisionGrid]) {
    if (grid && overlapsGrid(position, grid, world)) return true;
  }
  return world.accessOverlay ? overlapsAnyBlocker(position, world.accessOverlay, world) : false;
}

function overlapsBlocker(x: number, z: number, wall: Blocker, radius: number): boolean {
  radius = wall.playerClearanceRadius ?? radius;
  const halfWidth = wall.width / 2;
  const halfDepth = wall.depth / 2;
  const closestX = Math.max(wall.x - halfWidth, Math.min(x, wall.x + halfWidth));
  const closestZ = Math.max(wall.z - halfDepth, Math.min(z, wall.z + halfDepth));
  const dx = x - closestX;
  const dz = z - closestZ;
  return dx * dx + dz * dz < radius * radius;
}

export function isPositionWalkable(position: Position, world: WorldConfig = WORLD): boolean {
  const limitX = world.width / 2 - world.playerRadius;
  const limitZ = world.depth / 2 - world.playerRadius;
  return (
    Math.abs(position.x) <= limitX &&
    Math.abs(position.z) <= limitZ &&
    !hasNearbyBlocker(position, world)
  );
}
