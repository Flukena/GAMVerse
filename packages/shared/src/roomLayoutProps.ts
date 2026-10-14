import { normalizePropInteraction } from "./propInteraction.js";
import type { RoomLayoutProp, RoomPropDefinition } from "./roomPropTypes.js";

const PROP_MAX_ELEVATION_M = 15;
const PROP_MIN_PERSISTED_ELEVATION_M = 0.001;
const FLOOR_TILE_MAX_SCALE_RATIO = 1.5;
const FLOOR_TILE_GROUP = "Floor tiles";

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
      width: floorDimension(p.width, definition.width, scalable),
      depth: floorDimension(p.depth, definition.depth, scalable),
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
