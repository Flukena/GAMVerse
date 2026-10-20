import { ROOM_PROP_CATALOG, type RoomLayout, type RoomLayoutProp } from "./roomLayout.js";

const MAX_FINISHED_BUILDINGS = 18;
/** Prefab variety is limited, so a second pass may reuse a prefab to keep filling open blocks. */
const PLACEMENT_PASSES = 2;
const PLACEMENT_GRID_M = 2;
const PLACEMENT_CLEARANCE_M = 0.75;
/** A finished building must sit within this distance of a road to read as a street block. */
const ROAD_FRONTAGE_M = 16;

type Footprint = { x: number; z: number; width: number; depth: number };

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

function rotatedFootprint(width: number, depth: number, rotation: number) {
  const cosine = Math.abs(Math.cos(rotation));
  const sine = Math.abs(Math.sin(rotation));
  return { width: width * cosine + depth * sine, depth: depth * cosine + width * sine };
}

function propFootprint(prop: RoomLayoutProp): Footprint {
  const rotated = rotatedFootprint(prop.width, prop.depth, prop.rotation);
  return { x: prop.x, z: prop.z, ...rotated };
}

function overlaps(a: Footprint, b: Footprint) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + PLACEMENT_CLEARANCE_M
    && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + PLACEMENT_CLEARANCE_M;
}

function gridValues(min: number, max: number) {
  const values: number[] = [];
  const first = Math.ceil(min / PLACEMENT_GRID_M) * PLACEMENT_GRID_M;
  for (let value = first; value <= max; value += PLACEMENT_GRID_M) values.push(value);
  return values;
}

/** Upper bound on generated finished buildings in one campus map. */
export const CAMPUS_FINISHED_BUILDING_LIMIT = MAX_FINISHED_BUILDINGS;

/** Pick finished-building placements that fit free outdoor space in the generated map. */
export function placeCampusFinishedBuildings(layout: RoomLayout, random: () => number, reservedAreas: readonly Footprint[] = []): RoomLayoutProp[] {
  if (!layout.dimensions) return [];
  const bounds = layout.dimensions;
  const definitions = shuffled(ROOM_PROP_CATALOG.filter((item) => item.editorRole === "building-prefab"), random)
    .sort((a, b) => b.width * b.depth - a.width * a.depth);
  const occupiedProps = layout.props.map(propFootprint);
  const occupiedZones = layout.zones.map((zone) => ({ x: zone.x, z: zone.z, width: zone.width, depth: zone.depth }));
  const occupiedRoads = (layout.roadways ?? []).map((road) => ({ x: road.x, z: road.z, width: road.width, depth: road.depth }));
  const facesRoad = (footprint: Footprint) => occupiedRoads.length === 0 || occupiedRoads.some((road) => {
    const gapX = Math.max(0, Math.abs(footprint.x - road.x) - (footprint.width + road.width) / 2);
    const gapZ = Math.max(0, Math.abs(footprint.z - road.z) - (footprint.depth + road.depth) / 2);
    return Math.hypot(gapX, gapZ) <= ROAD_FRONTAGE_M;
  });
  const placed: RoomLayoutProp[] = [];

  for (let pass = 0; pass < PLACEMENT_PASSES; pass += 1) for (const definition of definitions) {
    if (placed.length >= MAX_FINISHED_BUILDINGS) break;
    const rotations = shuffled([0, Math.PI / 2], random);
    let placement: RoomLayoutProp | undefined;

    for (const rotation of rotations) {
      const size = rotatedFootprint(definition.width, definition.depth, rotation);
      const minX = -bounds.width / 2 + size.width / 2 + PLACEMENT_CLEARANCE_M;
      const maxX = bounds.width / 2 - size.width / 2 - PLACEMENT_CLEARANCE_M;
      const minZ = -bounds.depth / 2 + size.depth / 2 + PLACEMENT_CLEARANCE_M;
      const maxZ = bounds.depth / 2 - size.depth / 2 - PLACEMENT_CLEARANCE_M;
      const candidates = shuffled(gridValues(minX, maxX).flatMap((x) => gridValues(minZ, maxZ).map((z) => ({ x, z }))), random);

      for (const point of candidates) {
        const footprint = { ...point, ...size };
        if (reservedAreas.some(area => overlaps(footprint, area))) continue;
        if (occupiedRoads.some((area) => overlaps(footprint, area)) || occupiedZones.some((area) => overlaps(footprint, area))) continue;
        if (!facesRoad(footprint)) continue;
        if (occupiedProps.some((prop) => overlaps(footprint, prop))) continue;
        if (placed.some((prop) => overlaps(footprint, propFootprint(prop)))) continue;
        placement = {
          id: `campus-finished-building-${placed.length + 1}`,
          asset: definition.asset,
          ...point,
          rotation,
          collision: definition.collision,
          width: definition.width,
          depth: definition.depth,
        };
        break;
      }
      if (placement) break;
    }
    if (placement) placed.push(placement);
  }

  return placed;
}
