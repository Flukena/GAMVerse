import { normalizePropInteraction } from "./propInteraction.js";
import type { RoomLayoutProp, RoomPropDefinition } from "./roomPropTypes.js";

const PROP_MAX_ELEVATION_M = 15;
const PROP_MIN_PERSISTED_ELEVATION_M = 0.001;
const FLOOR_TILE_MAX_SCALE_RATIO = 1.5;
const FLOOR_TILE_GROUP = "Floor tiles";
export const ROOM_PROP_BLOCK_SIZE_M = 1;

/** Round a prop's placement footprint up to whole map blocks. */
export function roomPropBlockFootprint(width: number, depth: number): { width: number; depth: number } {
  const toBlocks = (dimension: number) => Math.max(
    ROOM_PROP_BLOCK_SIZE_M,
    Math.ceil(Math.max(0, dimension) / ROOM_PROP_BLOCK_SIZE_M - 1e-9) * ROOM_PROP_BLOCK_SIZE_M,
  );
  return { width: toBlocks(width), depth: toBlocks(depth) };
}

function floorDimension(
  value: unknown,
  baseM: number,
  scalable: boolean,
): number {
  return scalable && Number.isFinite(value)
    ? Math.min(
        baseM * FLOOR_TILE_MAX_SCALE_RATIO,
        Math.max(baseM, Number(value)),
      )
    : baseM;
}
function readProp(
  value: unknown,
  catalog: readonly RoomPropDefinition[],
): RoomLayoutProp[] {
  if (typeof value !== "object" || value === null) return [];
  const p = value as Partial<RoomLayoutProp>;
  const definition = catalog.find((entry) => entry.asset === p.asset);
  if (
    !definition ||
    typeof p.id !== "string" ||
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.z)
  )
    return [];
  const elevation =
    Number.isFinite(p.elevation) &&
    Math.abs(Number(p.elevation)) <= PROP_MAX_ELEVATION_M
      ? Number(p.elevation)
      : 0;
  const scalable = definition.group === FLOOR_TILE_GROUP;
  const interaction = normalizePropInteraction(p.interaction);
  return [
    {
      id: p.id,
      asset: definition.asset,
      x: Number(p.x),
      z: Number(p.z),
      rotation: Number.isFinite(p.rotation) ? Number(p.rotation) : 0,
      collision:
        typeof p.collision === "boolean" ? p.collision : definition.collision,
      width: scalable ? floorDimension(p.width, definition.width, true) : definition.width,
      depth: scalable ? floorDimension(p.depth, definition.depth, true) : definition.depth,
      ...(elevation > PROP_MIN_PERSISTED_ELEVATION_M ? { elevation } : {}),
      ...(interaction ? { interaction } : {}),
    },
  ];
}
export function readRoomLayoutProps(
  value: unknown,
  catalog: readonly RoomPropDefinition[],
): RoomLayoutProp[] {
  return Array.isArray(value)
    ? value.flatMap((prop) => readProp(prop, catalog))
    : [];
}
