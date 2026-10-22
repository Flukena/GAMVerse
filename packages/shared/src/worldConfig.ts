import { WORLD, CAMPUS_WORLD } from "./worldDefaults.js";
import type { Blocker, Position, WorldConfig } from "./worldTypes.js";
import { makeBlockerGrid } from "./blockerGrid.js";
import { readRoomLayout, roomPropCollisionClearanceRadius, roomPropCollisionFootprint } from "./roomLayout.js";
import type { RoomLayoutProp } from "./roomPropTypes.js";
import { isRoomWallProp } from "./roomWallProps.js";
import { roomBoundaryWalls, roomWallSolidSegments } from "./roomWallSegments.js";
import { zoneAtWithExitMargin } from "./zoneMembership.js";

const SPAWN_SEARCH_GRID_SIDE_COUNT = 21;
const SPAWN_SEARCH_HALF_GRID_COUNT = 10;
const SPAWN_SEARCH_SPACING_M = 1.1;

function placedPropBlocker(prop: RoomLayoutProp, defaultPlayerRadiusM: number): Blocker {
  const footprint = roomPropCollisionFootprint(prop);
  const playerClearanceRadius = roomPropCollisionClearanceRadius(prop);
  return {
    x: prop.x,
    z: prop.z,
    width: footprint.width,
    depth: footprint.depth,
    ...(playerClearanceRadius !== defaultPlayerRadiusM ? { playerClearanceRadius } : {}),
  };
}

/** Builds per-room blockers from the same saved prop layout rendered by the client. */
export function roomWorldFromConfig(config: unknown): WorldConfig {
  if (typeof config !== "object" || config === null || !("layout" in config)) return WORLD;
  const layout = readRoomLayout(config);
  const placedProps: Blocker[] = layout.props.filter((prop) => prop.collision && !prop.elevation).map((prop) => placedPropBlocker(prop, WORLD.playerRadius));
  const obstacles = placedProps;
  return { ...WORLD, obstacles, collisionGrid: makeBlockerGrid([...WORLD.walls, ...obstacles]) };
}

/** The office map's saved props use the same Campus coordinates as players and rendering. */
export function campusWorldFromConfig(
  config: unknown,
  excludedPropIds: ReadonlySet<string> = new Set(),
  propPositionOverrides: ReadonlyMap<string, { x: number; z: number; rotation?: number }> = new Map(),
): WorldConfig {
  const layout = readRoomLayout(config);
  const props = propPositionOverrides.size
    ? layout.props.map((prop) => {
      const position = propPositionOverrides.get(prop.id);
      return position ? { ...prop, ...position } : prop;
    })
    : layout.props;
  const width = layout.dimensions?.width ?? CAMPUS_WORLD.width;
  const depth = layout.dimensions?.depth ?? CAMPUS_WORLD.depth;
  const spawnPoints = layout.spawnPoint
    ? [
        layout.spawnPoint,
        ...Array.from({ length: SPAWN_SEARCH_GRID_SIDE_COUNT * SPAWN_SEARCH_GRID_SIDE_COUNT }, (_, index) => ({ dx: index % SPAWN_SEARCH_GRID_SIDE_COUNT - SPAWN_SEARCH_HALF_GRID_COUNT, dz: Math.floor(index / SPAWN_SEARCH_GRID_SIDE_COUNT) - SPAWN_SEARCH_HALF_GRID_COUNT }))
          .filter(({ dx, dz }) => dx !== 0 || dz !== 0)
          .sort((first, second) => Math.hypot(first.dx, first.dz) - Math.hypot(second.dx, second.dz))
          .map(({ dx, dz }) => ({ x: layout.spawnPoint!.x + dx * SPAWN_SEARCH_SPACING_M, z: layout.spawnPoint!.z + dz * SPAWN_SEARCH_SPACING_M })),
        ...CAMPUS_WORLD.spawnPoints,
      ]
    : CAMPUS_WORLD.spawnPoints;
  // Wall-like assets stay solid in Ghost mode even when saved with a raised
  // placement height. Elevation must not silently turn structural geometry
  // into a pass-through prop.
  const wallProps = props.filter((prop) => !excludedPropIds.has(prop.id) && isRoomWallProp(prop));
  const wallPropIds = new Set(wallProps.map((prop) => prop.id));
  const placedProps: Blocker[] = props.filter((prop) => !excludedPropIds.has(prop.id) && !wallPropIds.has(prop.id) && prop.collision && !prop.elevation).map((prop) => placedPropBlocker(prop, CAMPUS_WORLD.playerRadius));
  const mapWalls: Blocker[] = layout.walls.flatMap((wall) => {
    const segments = roomWallSolidSegments(wall, layout.doors);
    return segments.map(({ start, end }) => wall.axis === "horizontal"
      ? { x: wall.x + (start + end) / 2, z: wall.z, width: end - start, depth: wall.thickness }
      : { x: wall.x, z: wall.z + (start + end) / 2, width: wall.thickness, depth: end - start });
  });
  const placedWallProps: Blocker[] = wallProps.map((prop) => {
    const footprint = roomPropCollisionFootprint(prop);
    return { x: prop.x, z: prop.z, width: footprint.width, depth: footprint.depth, playerClearanceRadius: CAMPUS_WORLD.playerRadius };
  });
  const boundaryWalls: Blocker[] = roomBoundaryWalls(width, depth);
  // An office's saved map is the source of truth for its furniture collision.
  // CAMPUS_WORLD.obstacles belong to the legacy built-in campus scene; carrying
  // those blockers into a custom office map creates invisible furniture around
  // (0, 0), which can block auto routes and chair approaches even though the
  // old scene objects are not rendered there.
  const obstacles = placedProps;
  const walls = [...boundaryWalls, ...mapWalls, ...placedWallProps];
  return { ...CAMPUS_WORLD, width, depth, spawnPoints, walls, obstacles, collisionGrid: makeBlockerGrid([...walls, ...obstacles]) };
}

export function roomLayoutZoneAt(position: Position, config: unknown, previousZoneId?: string | null) {
  return zoneAtWithExitMargin(position, readRoomLayout(config).zones, previousZoneId);
}
