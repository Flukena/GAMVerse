import { CIVIC_PARK_ASSETS } from "./campusCivicParkCatalog.js";
import { ROOM_PROP_CATALOG, type RoomLayout, type RoomLayoutProp } from "./roomLayout.js";
export { CIVIC_PARK_ASSETS } from "./campusCivicParkCatalog.js";

const PATH_TILE_STEP_M = 2;
const POND_HALF_OFFSET_M = 5;
const TREE_CLEARANCE_M = 0.8;
const QUARTER_TURN_RAD = Math.PI / 2;
const HALF_TURN_RAD = Math.PI;
const COMPACT_POND_CENTERS_M = [[-50, -24], [50, 28]] as const;
const GENERIC_POND_CENTERS_M = [[-79, 32], [63, -30]] as const;
const COMPACT_PATH_SEGMENTS_M = [
  [-76, -34, 76, -34], [-76, 34, 76, 34], [-76, -34, -76, 34], [76, -34, 76, 34],
  [-30, -34, -30, 34], [25, -34, 25, 34], [-76, 0, -60, 0], [25, 0, 29, 0],
  [0, 24, 0, 34], [-50, -34, -50, -10], [50, 22, 50, 34], [-96, 0, -90, 0],
] as const;
const GENERIC_PATH_SEGMENTS_M = [
  [-112, -40, -6, -40], [6, -40, 114, -40], [-112, 40, -6, 40], [6, 40, 114, 40],
  [-112, -40, -112, 40], [114, -40, 114, 40], [-79, 24, -79, 40], [63, -40, 63, -18],
  [-29, 24, -29, 40], [6, 0, 12, 0],
] as const;
const COMPACT_GARDEN_CENTERS_M = [[-70, -24], [-70, 24], [-36, -26], [-36, 26], [73, -26], [73, 26], [-24, -30], [26, -30]] as const;
const GENERIC_GARDEN_CENTERS_M = [[-108, -30], [-108, 30], [-55, -31], [-55, 31], [-8, -30], [8, 30], [42, -29], [82, 29]] as const;
const COMPACT_CANOPY_X_M = [-128, -116, -104, -92, -72, -60, -36, -24, 0, 24, 36, 60, 72, 92, 104, 116, 128];
const GENERIC_CANOPY_X_M = [-112, -100, -88, -76, -64, -52, -40, -28, -16, 16, 28, 40, 52, 64, 76, 88, 100, 112];
const COMPACT_BENCH_CENTERS_M = [[-62, -29], [-38, -18], [38, 28], [62, 28], [-70, 18], [70, -18]] as const;
const GENERIC_BENCH_CENTERS_M = [[-91, 33], [-67, 33], [51, -31], [75, -31]] as const;
const COMPACT_CANOPY_Z_M = 30;
const GENERIC_CANOPY_Z_M = 34;
const POND_CROSSING_HALF_LENGTH_M = 4;
const FLOWERBED_OFFSET_M = 5;
const BENCH_LIGHT_OFFSET_M = 3;
const BENCH_BIN_OFFSET_M = -2;
const GEOMETRY_TOLERANCE_M = 0.001;
const PARK_TREE_ASSETS = ROOM_PROP_CATALOG
  .filter(item => (item.asset.startsWith("nature-kenney-nature-kit-tree-") || item.asset.startsWith("kit-mini-forest-tree"))
    && item.width <= 2 && item.depth <= 2 && item.height >= 1)
  .map(item => item.asset);
const PARK_ROCK_ASSETS = ROOM_PROP_CATALOG
  .filter(item => /rock/i.test(item.asset) && item.editorRole === "map-component" && item.width <= 3 && item.depth <= 3)
  .map(item => item.asset);
export type CivicParkSurface = Pick<RoomLayoutProp, "id" | "x" | "z" | "width" | "depth"> & { kind: "water" | "path" | "bridge" };

/** Render persisted surfaces only: existing saved offices do not acquire a new park. */
export function campusCivicParkSurfaces(layout: Pick<RoomLayout, "props">): CivicParkSurface[] {
  return layout.props.flatMap(prop => {
    const kind = prop.asset === CIVIC_PARK_ASSETS.water ? "water" : prop.asset === CIVIC_PARK_ASSETS.path ? "path" : prop.asset === CIVIC_PARK_ASSETS.bridge ? "bridge" : undefined;
    return kind ? [{ kind, id: prop.id, x: prop.x, z: prop.z, width: prop.width, depth: prop.depth }] : [];
  });
}

/** Reserve a designed waterfront before generic building infill and roadside planting. */
export function appendCampusCivicParkProps(layout: RoomLayout, compact: boolean): void {
  const surfaceTiles = new Map<string, { x: number; z: number; bridge: boolean }>();
  const footprint = (prop: RoomLayoutProp) => ({
    x: prop.x, z: prop.z,
    width: Math.abs(Math.cos(prop.rotation)) * prop.width + Math.abs(Math.sin(prop.rotation)) * prop.depth,
    depth: Math.abs(Math.sin(prop.rotation)) * prop.width + Math.abs(Math.cos(prop.rotation)) * prop.depth,
  });
  const overlaps = (first: { x: number; z: number; width: number; depth: number }, second: { x: number; z: number; width: number; depth: number }, clearanceM = 0) =>
    Math.abs(first.x - second.x) < (first.width + second.width) / 2 + clearanceM - GEOMETRY_TOLERANCE_M
      && Math.abs(first.z - second.z) < (first.depth + second.depth) / 2 + clearanceM - GEOMETRY_TOLERANCE_M;
  const add = (key: string, asset: string, x: number, z: number, rotation = 0, clearanceM = 0) => {
    const definition = ROOM_PROP_CATALOG.find(item => item.asset === asset);
    if (!definition) throw new Error(`Missing civic park asset ${asset}.`);
    const prop: RoomLayoutProp = { id: `campus-civic-park-${key}`, asset, x, z, rotation, width: definition.width, depth: definition.depth, collision: definition.collision };
    const area = footprint(prop);
    if (layout.zones.some(zone => overlaps(area, zone, clearanceM)) || layout.roadways?.some(road => overlaps(area, road, clearanceM))) return;
    if (layout.props.some(other => overlaps(area, footprint(other), clearanceM))) return;
    layout.props.push(prop);
  };
  const path = (x1: number, z1: number, x2: number, z2: number, bridge = false) => {
    const steps = Math.round(Math.hypot(x2 - x1, z2 - z1) / PATH_TILE_STEP_M);
    for (let index = 0; index <= steps; index++) {
      const ratio = steps ? index / steps : 0;
      const x = x1 + (x2 - x1) * ratio;
      const z = z1 + (z2 - z1) * ratio;
      const key = `${x},${z}`;
      surfaceTiles.set(key, { x, z, bridge: bridge || (surfaceTiles.get(key)?.bridge ?? false) });
    }
  };
  const pond = (x: number, z: number, index: number) => {
    for (const side of [-1, 1]) add(`pond-${index}-${side}`, CIVIC_PARK_ASSETS.water, x + side * POND_HALF_OFFSET_M, z);
    // Water is split either side of a four-metre dry channel. The bridge
    // occupies its middle, so shared collision agrees with the visible crossing.
    path(x, z - POND_CROSSING_HALF_LENGTH_M, x, z + POND_CROSSING_HALF_LENGTH_M, true);
  };
  for (const [index, [x, z]] of (compact ? COMPACT_POND_CENTERS_M : GENERIC_POND_CENTERS_M).entries()) pond(x, z, index + 1);
  for (const [x1, z1, x2, z2] of compact ? COMPACT_PATH_SEGMENTS_M : GENERIC_PATH_SEGMENTS_M) path(x1, z1, x2, z2);
  for (const [key, tile] of surfaceTiles) add(`surface-${key}`, tile.bridge ? CIVIC_PARK_ASSETS.bridge : CIVIC_PARK_ASSETS.path, tile.x, tile.z);

  const gardenSpots = compact ? COMPACT_GARDEN_CENTERS_M : GENERIC_GARDEN_CENTERS_M;
  for (const [index, [x, z]] of gardenSpots.entries()) {
    add(`tree-${index}`, "external-city-park-and-playground-33684", x, z, 0, TREE_CLEARANCE_M);
    add(`flowerbed-${index}`, "external-city-park-and-playground-33682", x, z + Math.sign(-z) * FLOWERBED_OFFSET_M, 0, TREE_CLEARANCE_M);
  }
  const canopyX_M = compact ? COMPACT_CANOPY_X_M : GENERIC_CANOPY_X_M;
  const canopyZ_M = compact ? COMPACT_CANOPY_Z_M : GENERIC_CANOPY_Z_M;
  for (const [index, x] of canopyX_M.entries()) for (const side of [-1, 1]) {
    add(`canopy-${side}-${index}`, "external-city-park-and-playground-33684", x, side * canopyZ_M, 0, TREE_CLEARANCE_M);
  }
  const benches = compact ? COMPACT_BENCH_CENTERS_M : GENERIC_BENCH_CENTERS_M;
  for (const [index, [x, z]] of benches.entries()) {
    add(`bench-${index}`, "kit:benchcushionlow", x, z, index % 2 ? -QUARTER_TURN_RAD : QUARTER_TURN_RAD, TREE_CLEARANCE_M);
    add(`light-${index}`, "kenney-city-kit-roads-light-square", x, z + BENCH_LIGHT_OFFSET_M, 0, TREE_CLEARANCE_M);
    add(`bin-${index}`, "kit:trashcan", x, z + BENCH_BIN_OFFSET_M, HALF_TURN_RAD, TREE_CLEARANCE_M);
  }

  // Turn the broad left and right lawns into planted groves around the water,
  // while keeping each tree on the landscaped side of the walking paths.
  const groveSpots = compact
    ? [[-120, -12], [-104, 12], [-88, -18], [-72, 14], [-40, -14], [-16, 16], [16, -16], [40, 14], [72, -14], [96, 16], [120, -12]] as const
    : [[-100, -16], [-84, 16], [-60, -14], [-36, 16], [-12, -16], [12, 16], [36, -16], [60, 14], [84, -16], [108, 14]] as const;
  for (const [index, [x, z]] of groveSpots.entries()) {
    const asset = PARK_TREE_ASSETS[(index * 7 + Math.floor(index / 3)) % PARK_TREE_ASSETS.length]!;
    add(`grove-tree-${index}`, asset, x, z, (index % 4) * QUARTER_TURN_RAD, TREE_CLEARANCE_M);
  }

  // A staggered grove fills the open western lawn, with the normal placement
  // clearance keeping trunks away from paths, roads, rooms and each other.
  let groveIndex = groveSpots.length;
  for (let x = -142; x <= -34; x += 12) for (const row of [-1, 1] as const) for (const band of [14, 28] as const) {
    const z = row * (band + (Math.floor((x + 142) / 12) % 2) * 2);
    const asset = PARK_TREE_ASSETS[(groveIndex * 7 + Math.floor(groveIndex / 3)) % PARK_TREE_ASSETS.length]!;
    add(`west-grove-tree-${groveIndex++}`, asset, x, z, (groveIndex % 4) * QUARTER_TURN_RAD, TREE_CLEARANCE_M);
  }

  // Natural rock clusters frame the ponds and path junctions without blocking
  // the bridges or the clear walking loop.
  const pondCenters = compact ? COMPACT_POND_CENTERS_M : GENERIC_POND_CENTERS_M;
  let rockIndex = 0;
  for (const [pondIndex, [x, z]] of pondCenters.entries()) {
    for (const [dx, dz] of [[-12, -7], [-12, 7], [12, -7], [12, 7]] as const) {
      const asset = PARK_ROCK_ASSETS[(rockIndex * 5 + pondIndex) % PARK_ROCK_ASSETS.length]!;
      add(`pond-rock-${rockIndex++}`, asset, x + dx, z + dz, (rockIndex % 4) * QUARTER_TURN_RAD, 0.25);
    }
  }

  const extraBenchSpots = compact
    ? [[-92, -4], [-58, 4], [-20, -4], [20, 4], [58, -4], [92, 4]] as const
    : [[-96, 4], [-48, -4], [0, 4], [48, -4], [96, 4]] as const;
  for (const [index, [x, z]] of extraBenchSpots.entries()) {
    add(`garden-bench-${index}`, "kit:benchcushionlow", x, z, index % 2 ? -QUARTER_TURN_RAD : QUARTER_TURN_RAD, TREE_CLEARANCE_M);
  }
  let westBenchIndex = 0;
  for (let x = -136; x <= -52; x += 28) {
    add(`west-garden-bench-${westBenchIndex}`, "kit:benchcushionlow", x, westBenchIndex % 2 ? 20 : -20, westBenchIndex % 2 ? -QUARTER_TURN_RAD : QUARTER_TURN_RAD, TREE_CLEARANCE_M);
    westBenchIndex += 1;
  }

  if (compact) {
    // The landscaped block beside the lobby is the public park; the opposite
    // empty block is reserved for the football field and running track.
    // Frame the water with a loop path and plant both
    // sides of the block so the area reads as a destination rather than lawn.
    const westPond = [-150, 0] as const;
    pond(westPond[0], westPond[1], 3);
    for (const [x1, z1, x2, z2] of [
      [-170, -28, -94, -28], [-170, 28, -94, 28],
      [-170, -28, -170, 28], [-94, -28, -94, 28],
      [-170, 0, -158, 0],
    ] as const) path(x1, z1, x2, z2);
    for (const [key, tile] of surfaceTiles) add(`surface-${key}`, tile.bridge ? CIVIC_PARK_ASSETS.bridge : CIVIC_PARK_ASSETS.path, tile.x, tile.z);
    let westParkTreeIndex = 0;
    for (const x of [-164, -152, -140, -130] as const) for (const z of [-22, -10, 10, 22] as const) {
      const index = westParkTreeIndex++;
      const asset = PARK_TREE_ASSETS[(index * 7 + Math.floor(index / 3)) % PARK_TREE_ASSETS.length]!;
      add(`west-public-park-tree-${index}`, asset, x, z, (index % 4) * QUARTER_TURN_RAD, TREE_CLEARANCE_M);
    }
    for (const [index, [x, z]] of ([[-164, -16], [-164, 16], [-140, -16], [-140, 16], [-130, -16], [-130, 16]] as const).entries()) {
      add(`west-public-park-bench-${index}`, "kit:benchcushionlow", x, z, index % 2 ? -QUARTER_TURN_RAD : QUARTER_TURN_RAD, TREE_CLEARANCE_M);
    }
    for (const [index, [x, z]] of ([[-160, -6], [-160, 6], [-140, -6], [-140, 6], [-130, -6], [-130, 6]] as const).entries()) {
      const asset = PARK_ROCK_ASSETS[(index * 5 + 2) % PARK_ROCK_ASSETS.length]!;
      add(`west-public-park-rock-${index}`, asset, x, z, (index % 4) * QUARTER_TURN_RAD, 0.25);
    }
  }
}
