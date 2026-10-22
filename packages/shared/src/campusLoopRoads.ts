import type { RoomLayoutRoadway, RoomLayoutZone } from "./roomLayoutTypes.js";

const AVENUE_WIDTH_M = 8;
const ALLEY_WIDTH_M = 4;
/** Space for a sidewalk beyond the outside edge of the perimeter street. */
const MAP_EDGE_VERGE_M = 4;
const GEOMETRY_TOLERANCE_M = 0.001;

/** Closed perimeter and block loops. Every alley has an exit at both ends. */
export function campusLoopRoads(
  zones: readonly RoomLayoutZone[],
  dimensions: { width: number; depth: number },
  compact: boolean,
): RoomLayoutRoadway[] {
  const roads: RoomLayoutRoadway[] = [];
  const ringX = dimensions.width / 2 - MAP_EDGE_VERGE_M - AVENUE_WIDTH_M / 2;
  const ringZ = dimensions.depth / 2 - MAP_EDGE_VERGE_M - AVENUE_WIDTH_M / 2;
  const horizontal = (id: string, left: number, right: number, z: number, widthM: number, kind: "major" | "small") => {
    roads.push({ id, x: (left + right) / 2, z, width: right - left + widthM, depth: widthM, kind });
  };
  const vertical = (id: string, x: number, north: number, south: number, widthM: number, kind: "major" | "small") => {
    roads.push({ id, x, z: (north + south) / 2, width: widthM, depth: south - north + widthM, kind });
  };
  for (const side of [-1, 1]) {
    horizontal(`road-loop-edge-${side}`, -ringX, ringX, side * ringZ, AVENUE_WIDTH_M, "major");
    vertical(`road-loop-side-${side}`, side * ringX, -ringZ, ringZ, AVENUE_WIDTH_M, "major");
  }
  const edgeRoadZ = compact ? 114 : 108;
  const teamRoadZ = compact ? 40 : 50;
  for (const side of [-1, 1]) {
    horizontal(`road-major-edge-${side}`, -ringX, ringX, side * edgeRoadZ, AVENUE_WIDTH_M, "major");
    horizontal(`road-major-team-${side}`, -ringX, ringX, side * teamRoadZ, AVENUE_WIDTH_M, "major");
    // Keep the four internal team-block aisles open for building infill;
    // the west/east block loops and perimeter street provide alternate routes.
    if (!compact) {
      vertical(`road-major-avenue-0-${side}`, 0, side < 0 ? -edgeRoadZ : teamRoadZ, side < 0 ? -teamRoadZ : edgeRoadZ, AVENUE_WIDTH_M, "major");
    }
  }
  for (const x of compact ? [-84, 84] : [0]) {
    vertical(`road-major-civic-${x}`, x, -teamRoadZ, teamRoadZ, AVENUE_WIDTH_M, "major");
  }

  const teams = new Map<string, RoomLayoutZone[]>();
  for (const zone of zones) {
    const teamId = /^(team-\d+)-office-/.exec(zone.id)?.[1];
    if (!teamId) continue;
    const rooms = teams.get(teamId) ?? [];
    rooms.push(zone);
    teams.set(teamId, rooms);
  }
  for (const [teamId, rooms] of teams) {
    const left = Math.min(...rooms.map((room) => room.x - room.width / 2)) - ALLEY_WIDTH_M / 2;
    const right = Math.max(...rooms.map((room) => room.x + room.width / 2)) + ALLEY_WIDTH_M / 2;
    const north = rooms[0]!.z < 0 ? -edgeRoadZ : teamRoadZ;
    const south = rooms[0]!.z < 0 ? -teamRoadZ : edgeRoadZ;
    vertical(`${teamId}-loop-west`, left, north, south, ALLEY_WIDTH_M, "small");
    vertical(`${teamId}-loop-east`, right, north, south, ALLEY_WIDTH_M, "small");
    const rows = [...new Set(rooms.map((room) => room.z))].sort((a, b) => a - b);
    for (let row = 0; row < rows.length - 1; row += 1) {
      horizontal(`${teamId}-row-road-${row + 1}`, left, right, (rows[row]! + rows[row + 1]!) / 2, ALLEY_WIDTH_M, "small");
    }
  }
  // Catch unsupported future room geometry rather than silently placing roads
  // through walls. The current template dimensions reserve these corridors.
  for (const road of roads) for (const zone of zones) {
    if (Math.abs(road.x - zone.x) < (road.width + zone.width) / 2 - GEOMETRY_TOLERANCE_M
      && Math.abs(road.z - zone.z) < (road.depth + zone.depth) / 2 - GEOMETRY_TOLERANCE_M) {
      throw new Error(`Campus street ${road.id} overlaps room ${zone.id}.`);
    }
  }
  return roads;
}
