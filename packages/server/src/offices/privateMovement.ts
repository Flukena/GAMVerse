import { isPositionWalkable, type Position, type RoomLayoutZone, type WorldConfig } from "@gammyverse/shared";

const LARGE_WORLD_WIDTH_M = 30;
const LARGE_WORLD_SPAWN_GRID_STEP_M = 2.2;
const SMALL_WORLD_SPAWN_GRID_STEP_M = 0.94;
const SPAWN_BOUNDARY_INSET_M = 1;
const MIN_SPAWN_SEPARATION_M = 0.9;
const MIN_GRID_DIMENSION_CELLS = 1;

export function restrictedZoneWorld(world: WorldConfig, deniedZones: readonly RoomLayoutZone[]): WorldConfig {
  if (deniedZones.length === 0) return world;
  return { ...world, accessOverlay: [...(world.accessOverlay ?? []), ...deniedZones] };
}

function* spawnCandidates(world: WorldConfig): Generator<Position> {
  yield* world.spawnPoints;
  const stepM = world.width > LARGE_WORLD_WIDTH_M ? LARGE_WORLD_SPAWN_GRID_STEP_M : SMALL_WORLD_SPAWN_GRID_STEP_M;
  const columns = Math.max(MIN_GRID_DIMENSION_CELLS, Math.floor((world.width - SPAWN_BOUNDARY_INSET_M * 2) / stepM));
  const rows = Math.max(MIN_GRID_DIMENSION_CELLS, Math.floor((world.depth - SPAWN_BOUNDARY_INSET_M * 2) / stepM));
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      yield {
        x: -world.width / 2 + SPAWN_BOUNDARY_INSET_M + column * stepM,
        z: -world.depth / 2 + SPAWN_BOUNDARY_INSET_M + row * stepM,
      };
    }
  }
}

export function isAccessibleSpawn(position: Position, occupied: readonly Position[], world: WorldConfig): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.z) &&
    isPositionWalkable(position, world) &&
    occupied.every(player => Math.hypot(player.x - position.x, player.z - position.z) >= MIN_SPAWN_SEPARATION_M);
}

export function findAccessibleSpawn(occupied: readonly Position[], world: WorldConfig): Position | null {
  for (const candidate of spawnCandidates(world)) {
    if (isAccessibleSpawn(candidate, occupied, world)) return { x: candidate.x, z: candidate.z };
  }
  return null;
}
