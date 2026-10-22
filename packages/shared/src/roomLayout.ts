import type { RoomLayoutProp } from "./roomPropTypes.js";
import type { RoomLayout, RoomLayoutDoor, RoomLayoutWall, RoomLayoutZone } from "./roomLayoutTypes.js";
import { ROOM_DOOR_FRAME_ASSETS, ROOM_WALL_MODEL_ASSETS } from "./roomLayoutTypes.js";
import { readRoomLayoutProps } from "./roomLayoutProps.js";
import { isRoomPropBed, ROOM_PROP_CATALOG } from "./roomPropCatalog.js";

export type { RoomLayoutProp, RoomPropDefinition, RoomPropEditorRole } from "./roomPropTypes.js";
export type { OfficePropsSnapshot, RoomLayout, RoomLayoutDoor, RoomLayoutRoadway, RoomLayoutWall, RoomLayoutZone } from "./roomLayoutTypes.js";
export { ROOM_DOOR_FRAME_ASSETS, ROOM_WALL_MODEL_ASSETS } from "./roomLayoutTypes.js";
export { ROOM_PROP_BLOCK_SIZE_M, roomPropBlockFootprint } from "./roomLayoutProps.js";
export { isRoomPropBed, ROOM_PROP_CATALOG } from "./roomPropCatalog.js";

/** Axis-aligned ground footprint used by movement and collision for a rotated prop. */
export function roomPropCollisionFootprint(prop: Pick<RoomLayoutProp, "width" | "depth" | "rotation"> & Partial<Pick<RoomLayoutProp, "asset">>) {
  // Small seat props keep a cell-sized editor footprint, but their movement
  // blocker must match the authored furniture size. Sofas still block their
  // full natural length, while single chairs stay chair-sized.
  const definition = prop.asset ? ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset) : undefined;
  const width = definition?.collision && definition.collisionWidth != null ? definition.collisionWidth : definition?.interaction === "sit" ? definition.collisionWidth ?? definition.width : prop.width;
  const depth = definition?.collision && definition.collisionDepth != null ? definition.collisionDepth : definition?.interaction === "sit" ? definition.collisionDepth ?? definition.depth : prop.depth;
  const scale = definition?.interaction === "sit" ? definition.collisionScale ?? 1 : 1;
  const cos = Math.abs(Math.cos(prop.rotation));
  const sin = Math.abs(Math.sin(prop.rotation));
  return {
    width: width * scale * cos + depth * scale * sin,
    depth: depth * scale * cos + width * scale * sin,
  };
}

/** Chairs and sofas need less clearance than the full avatar radius to avoid oversized no-go zones. */
export function roomPropCollisionClearanceRadius(prop: Pick<RoomLayoutProp, "asset">, fallback = 0.38) {
  const definition = ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset);
  return definition?.interaction === "sit" ? definition.collisionClearanceRadius ?? fallback : fallback;
}

export type RoomPropSeatAnchor = { index: number; x: number; z: number; y: number; rotation: number; localX: number; localZ: number };

/**
 * Return stable individual seating positions for a sit-interactable prop.
 * Long props receive one place per block of usable length (a 3 m sofa seats
 * three), while normal chairs remain single-seat. Local X is the primary axis;
 * deeper benches rotate the seating row onto local Z.
 */
export function roomPropSeatAnchors(prop: RoomLayoutProp, definition = ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset), renderedScale = 1): RoomPropSeatAnchor[] {
  if (definition?.interaction !== "sit") return [];
  const bed = isRoomPropBed(prop.asset);
  const useX = prop.width >= prop.depth;
  const length = useX ? prop.width : prop.depth;
  const capacity = bed ? (prop.asset === "kit:beddouble" ? 2 : 1) : Math.max(1, Math.min(12, Math.round(length)));
  const spacing = capacity > 1 ? (bed ? prop.width / capacity : length / capacity) : 0;
  const cos = Math.cos(prop.rotation);
  const sin = Math.sin(prop.rotation);
  return Array.from({ length: capacity }, (_, index) => {
    const along = (index - (capacity - 1) / 2) * spacing;
    const localX = bed || useX ? along : 0;
    const localZ = bed || useX ? 0 : along;
    return {
      index,
      x: prop.x + localX * cos + localZ * sin,
      z: prop.z - localX * sin + localZ * cos,
      // The rendered model may be reduced to fit its footprint after the
      // authored height normalization. Match the seat anchor to that exact
      // final scale so wide sofas and compact chairs do not leave the avatar
      // floating above (or embedded in) the cushion.
      y: (definition.seatHeight ?? Math.min(0.43, definition.height * 0.43)) * Math.max(0.01, renderedScale),
      rotation: prop.rotation,
      localX,
      localZ,
    };
  });
}

const ROOM_PROP_SEAT_SUFFIX = /::seat:(\d+)$/;
export function roomPropSeatReference(propId: string, seatIndex: number) {
  return `${propId}::seat:${seatIndex}`;
}
export function parseRoomPropSeatReference(reference: string) {
  const match = ROOM_PROP_SEAT_SUFFIX.exec(reference);
  return match
    ? { propId: reference.slice(0, match.index), seatIndex: Number(match[1]) }
    : { propId: reference, seatIndex: 0 };
}

/** Return the top height for a compatible supporting prop under an object's center. */
export function roomPropPlacementSupport(props: readonly RoomLayoutProp[], asset: string, x: number, z: number, rotation = 0) {
  const item = ROOM_PROP_CATALOG.find((entry) => entry.asset === asset);
  if (!item || (item.placementClass !== "small" && item.placementClass !== "shelf")) return null;
  const supports = props.flatMap((prop) => {
    const surface = ROOM_PROP_CATALOG.find((entry) => entry.asset === prop.asset);
    const compatible = item.placementClass === "small"
      ? surface?.supportsPlacement === "tabletop" || surface?.supportsPlacement === "shelf-top"
      : surface?.placementClass === "shelf";
    if (!surface || !compatible) return [];
    const dx = x - prop.x;
    const dz = z - prop.z;
    const cos = Math.cos(prop.rotation);
    const sin = Math.sin(prop.rotation);
    const localX = dx * cos + dz * sin;
    const localZ = -dx * sin + dz * cos;
    const itemCos = Math.abs(Math.cos(rotation - prop.rotation));
    const itemSin = Math.abs(Math.sin(rotation - prop.rotation));
    const itemWidth = item.width * itemCos + item.depth * itemSin;
    const itemDepth = item.depth * itemCos + item.width * itemSin;
    // Exact-fit props (including 1 × 1 m items on a 1 × 1 m surface) are valid;
    // allow only a tiny tolerance for floating-point rounding at the edges.
    if (Math.abs(localX) + itemWidth / 2 > prop.width / 2 + 0.001 || Math.abs(localZ) + itemDepth / 2 > prop.depth / 2 + 0.001) return [];
    return [{ prop, surface, elevation: (prop.elevation ?? 0) + surface.height, distance: Math.hypot(dx, dz) }];
  });
  return supports.sort((a, b) => b.elevation - a.elevation || a.distance - b.distance)[0] ?? null;
}

export function readRoomLayout(config: unknown): RoomLayout {
  if (typeof config !== "object" || config === null || !("layout" in config)) return { version: 1, props: [], zones: [], walls: [], doors: [] };
  const raw = (config as { layout?: unknown }).layout;
  if (typeof raw !== "object" || raw === null) return { version: 1, props: [], zones: [], walls: [], doors: [] };
  const record = raw as { props?: unknown; zones?: unknown; walls?: unknown; doors?: unknown; roadways?: unknown; dimensions?: unknown; spawnPoint?: unknown };
  const rawDimensions = typeof record.dimensions === "object" && record.dimensions !== null ? record.dimensions as { width?: unknown; depth?: unknown } : null;
  const dimensions = rawDimensions && Number.isFinite(rawDimensions.width) && Number.isFinite(rawDimensions.depth) && Number(rawDimensions.width) >= 40 && Number(rawDimensions.width) <= 1000 && Number(rawDimensions.depth) >= 40 && Number(rawDimensions.depth) <= 1000
    ? { width: Number(rawDimensions.width), depth: Number(rawDimensions.depth) }
    : undefined;
  const halfWidth = (dimensions?.width ?? 200) / 2;
  const halfDepth = (dimensions?.depth ?? 250) / 2;
  const spawn = typeof record.spawnPoint === "object" && record.spawnPoint !== null ? record.spawnPoint as { x?: unknown; z?: unknown } : null;
  const spawnPoint = spawn && Number.isFinite(spawn.x) && Number.isFinite(spawn.z) && Math.abs(Number(spawn.x)) <= halfWidth && Math.abs(Number(spawn.z)) <= halfDepth
    ? { x: Number(spawn.x), z: Number(spawn.z) }
    : undefined;
  const props = readRoomLayoutProps(record.props, ROOM_PROP_CATALOG);
  const zones = Array.isArray(record.zones) ? record.zones.flatMap((item): RoomLayoutZone[] => {
    if (typeof item !== "object" || item === null) return [];
    const z = item as Partial<RoomLayoutZone>;
    if (typeof z.id !== "string" || typeof z.name !== "string" || ![z.x, z.z, z.width, z.depth].every(Number.isFinite)) return [];
    const kind = z.kind === "meeting" || z.kind === "restroom" ? z.kind : "private";
    return [{ id: z.id, name: z.name.slice(0, 32), kind, ...(kind === "private" && typeof z.ownerUsername === "string" && z.ownerUsername.trim() ? { ownerUsername: z.ownerUsername.trim().slice(0, 64) } : {}), x: Number(z.x), z: Number(z.z), width: Number(z.width), depth: Number(z.depth), color: typeof z.color === "string" && /^#[0-9a-f]{6}$/i.test(z.color) ? z.color : kind === "meeting" ? "#8ecae6" : kind === "restroom" ? "#70c1b3" : "#ffb703" }];
  }) : [];
  const walls = Array.isArray(record.walls) ? record.walls.flatMap((item): RoomLayoutWall[] => {
    if (typeof item !== "object" || item === null) return [];
    const wall = item as Partial<RoomLayoutWall>;
    if (typeof wall.id !== "string" || (wall.axis !== "horizontal" && wall.axis !== "vertical") || ![wall.x, wall.z, wall.length].every(Number.isFinite)) return [];
    const length = Math.min(200, Math.max(1, Number(wall.length)));
    return [{ id: wall.id, axis: wall.axis, x: Number(wall.x), z: Number(wall.z), length, thickness: Math.min(1, Math.max(0.08, Number.isFinite(wall.thickness) ? Number(wall.thickness) : 0.2)), height: Math.min(6, Math.max(1, Number.isFinite(wall.height) ? Number(wall.height) : 2.4)), ...(typeof wall.color === "string" && /^#[0-9a-f]{6}$/i.test(wall.color) ? { color: wall.color } : {}), ...(ROOM_WALL_MODEL_ASSETS.includes(wall.asset as (typeof ROOM_WALL_MODEL_ASSETS)[number]) ? { asset: wall.asset as (typeof ROOM_WALL_MODEL_ASSETS)[number] } : {}) }];
  }).slice(0, 1000) : [];
  const wallIds = new Set(walls.map((wall) => wall.id));
  const doors = Array.isArray(record.doors) ? record.doors.flatMap((item): RoomLayoutDoor[] => {
    if (typeof item !== "object" || item === null) return [];
    const door = item as Partial<RoomLayoutDoor>;
    if (typeof door.id !== "string" || typeof door.wallId !== "string" || !wallIds.has(door.wallId) || !Number.isFinite(door.offset)) return [];
    const doorId = door.id;
    const doorWallId = door.wallId;
    // Earlier campus generator versions stored each generated room entrance
    // as an opening with an id ending in "-door". Upgrade only those known
    // generated entries while reading so existing saved campuses gain real
    // door leaves without changing intentional openings from the map editor.
    const generatedZone = door.kind === "opening"
      ? zones.find((zone) => doorId === `${zone.id}-door` && doorWallId.startsWith(`${zone.id}-wall-`))
      : undefined;
    const leaves = generatedZone?.kind === "private" || generatedZone?.kind === "restroom"
      ? 1 as const
      : door.leaves === 2 || generatedZone ? 2 as const : 1 as const;
    return [{ id: generatedZone ? `${generatedZone.id}-entrance-1` : doorId, wallId: doorWallId, offset: Number(door.offset), width: Math.min(4, Math.max(0.6, Number.isFinite(door.width) ? Number(door.width) : 1.2)), kind: generatedZone ? "door" : door.kind === "opening" ? "opening" : "door", leaves, ...(ROOM_DOOR_FRAME_ASSETS.includes(door.asset as (typeof ROOM_DOOR_FRAME_ASSETS)[number]) ? { asset: door.asset as (typeof ROOM_DOOR_FRAME_ASSETS)[number] } : {}) }];
  }).slice(0, 1000) : [];
  const roadways = Array.isArray(record.roadways) ? record.roadways.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const road = item as Record<string, unknown>;
    if (typeof road.id !== "string" || ![road.x, road.z, road.width, road.depth].every(Number.isFinite) || Number(road.width) < 1 || Number(road.depth) < 1) return [];
    return [{ id: road.id, x: Number(road.x), z: Number(road.z), width: Number(road.width), depth: Number(road.depth), kind: road.kind === "small" ? "small" as const : "major" as const }];
  }).slice(0, 500) : [];
  return { version: 1, props, zones, walls, doors, ...(roadways.length ? { roadways } : {}), ...(dimensions ? { dimensions } : {}), ...(spawnPoint ? { spawnPoint } : {}) };
}
