import type { RoomLayoutRoadway } from "./roomLayout.js";

/** Axis-aligned rectangle used for road overlap and blocker tests. */
export interface RoadRect {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface RoadConnectorOptions {
  /** Rectangles a connector may never cross, normally the generated rooms. */
  blockers: readonly RoadRect[];
  /** Map extents; connectors stay inside them. */
  bounds: { width: number; depth: number };
  idPrefix?: string;
}

/** Width of a generated link street, in metres. Wide enough to drive through. */
export const ROAD_CONNECTOR_WIDTH_M = 4;
/** Shared edges shorter than this do not count as a drivable junction. */
const MIN_JUNCTION_OVERLAP_M = 1.5;
/**
 * Overlap added at both ends so a connector merges into the roads it joins.
 * It must exceed the junction threshold, otherwise the link street would only
 * touch its neighbours and still leave the network split.
 */
const CONNECTOR_END_OVERLAP_M = MIN_JUNCTION_OVERLAP_M + 0.5;
/**
 * Roads legitimately run right up to a room wall, so only a real overlap with
 * a room rejects a link street.
 */
const BLOCKER_CLEARANCE_M = -0.05;
/** Guards the connector loop against pathological inputs. */
const MAX_CONNECTOR_PASSES = 200;

function spanOverlap(aCenter: number, aSize: number, bCenter: number, bSize: number) {
  const low = Math.max(aCenter - aSize / 2, bCenter - bSize / 2);
  const high = Math.min(aCenter + aSize / 2, bCenter + bSize / 2);
  return { low, high, length: high - low };
}

/** True when two road slabs share enough surface for a vehicle to drive across. */
export function roadsConnect(a: RoadRect, b: RoadRect) {
  const horizontal = spanOverlap(a.x, a.width, b.x, b.width);
  const vertical = spanOverlap(a.z, a.depth, b.z, b.depth);
  return horizontal.length >= MIN_JUNCTION_OVERLAP_M && vertical.length >= MIN_JUNCTION_OVERLAP_M;
}

/** Group roads into sets that are reachable from each other by driving. */
export function roadNetworkComponents(roads: readonly RoadRect[]): number[][] {
  const parent = roads.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    let cursor = index;
    while (parent[cursor] !== root) {
      const next = parent[cursor]!;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  for (let a = 0; a < roads.length; a += 1) {
    for (let b = a + 1; b < roads.length; b += 1) {
      if (roadsConnect(roads[a]!, roads[b]!)) parent[find(a)] = find(b);
    }
  }
  const groups = new Map<number, number[]>();
  for (let index = 0; index < roads.length; index += 1) {
    const root = find(index);
    const existing = groups.get(root);
    if (existing) existing.push(index);
    else groups.set(root, [index]);
  }
  return [...groups.values()];
}

/** True when every road can be reached from every other road without a gap. */
export function isRoadNetworkConnected(roads: readonly RoadRect[]) {
  return roadNetworkComponents(roads).length <= 1;
}

/**
 * Points along both verges of a road, just off the driving surface. Street
 * furniture uses these so every road edge gets trees, lights and bins instead
 * of props clustering on a few avenues.
 */
export function roadsideVergePoints(road: RoadRect, options: { spacingM: number; offsetM: number; marginM?: number }) {
  const { spacingM, offsetM, marginM = spacingM / 2 } = options;
  const horizontal = road.width >= road.depth;
  const length = horizontal ? road.width : road.depth;
  const usable = length - marginM * 2;
  if (usable <= 0 || spacingM <= 0) return [];
  const steps = Math.floor(usable / spacingM);
  const points: Array<{ x: number; z: number; rotation: number }> = [];
  for (let step = 0; step <= steps; step += 1) {
    const along = -length / 2 + marginM + step * spacingM;
    for (const side of [-1, 1]) {
      const across = side * ((horizontal ? road.depth : road.width) / 2 + offsetM);
      points.push(horizontal
        ? { x: road.x + along, z: road.z + across, rotation: side < 0 ? Math.PI : 0 }
        : { x: road.x + across, z: road.z + along, rotation: side < 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
  }
  return points;
}

function overlapsBlocker(candidate: RoadRect, blockers: readonly RoadRect[]) {
  return blockers.some((blocker) =>
    Math.abs(candidate.x - blocker.x) < (candidate.width + blocker.width) / 2 + BLOCKER_CLEARANCE_M
    && Math.abs(candidate.z - blocker.z) < (candidate.depth + blocker.depth) / 2 + BLOCKER_CLEARANCE_M);
}

function withinBounds(candidate: RoadRect, bounds: { width: number; depth: number }) {
  return Math.abs(candidate.x) + candidate.width / 2 <= bounds.width / 2
    && Math.abs(candidate.z) + candidate.depth / 2 <= bounds.depth / 2;
}

/** Straight link street joining two roads that already face each other. */
function straightConnector(a: RoadRect, b: RoadRect): RoadRect | undefined {
  const horizontal = spanOverlap(a.x, a.width, b.x, b.width);
  const vertical = spanOverlap(a.z, a.depth, b.z, b.depth);
  if (horizontal.length >= MIN_JUNCTION_OVERLAP_M) {
    // A zero gap means the roads meet edge to edge and share no surface to
    // drive across, so the link becomes a junction patch over that seam.
    const gap = Math.max(0, Math.abs(a.z - b.z) - (a.depth + b.depth) / 2);
    const seam = a.z < b.z ? a.z + a.depth / 2 : b.z + b.depth / 2;
    return {
      x: (horizontal.low + horizontal.high) / 2,
      z: seam + gap / 2,
      width: Math.min(ROAD_CONNECTOR_WIDTH_M, horizontal.length),
      depth: gap + CONNECTOR_END_OVERLAP_M * 2,
    };
  }
  if (vertical.length >= MIN_JUNCTION_OVERLAP_M) {
    const gap = Math.max(0, Math.abs(a.x - b.x) - (a.width + b.width) / 2);
    const seam = a.x < b.x ? a.x + a.width / 2 : b.x + b.width / 2;
    return {
      x: seam + gap / 2,
      z: (vertical.low + vertical.high) / 2,
      width: gap + CONNECTOR_END_OVERLAP_M * 2,
      depth: Math.min(ROAD_CONNECTOR_WIDTH_M, vertical.length),
    };
  }
  return undefined;
}

/**
 * Plan the extra link streets that turn a set of road slabs into one drivable
 * network. Returns only the new roads, so callers can append them to a layout.
 */
export function planRoadConnectors(roads: readonly RoomLayoutRoadway[], options: RoadConnectorOptions): RoomLayoutRoadway[] {
  const { blockers, bounds, idPrefix = "road-link" } = options;
  const network: RoomLayoutRoadway[] = [...roads];
  const connectors: RoomLayoutRoadway[] = [];

  for (let pass = 0; pass < MAX_CONNECTOR_PASSES; pass += 1) {
    const components = roadNetworkComponents(network);
    if (components.length <= 1) break;
    const sorted = [...components].sort((a, b) => b.length - a.length);
    const main = new Set(sorted[0]!);
    let best: { candidate: RoadRect; length: number } | undefined;

    for (const component of sorted.slice(1)) {
      for (const outsideIndex of component) {
        for (let insideIndex = 0; insideIndex < network.length; insideIndex += 1) {
          if (!main.has(insideIndex)) continue;
          const candidate = straightConnector(network[insideIndex]!, network[outsideIndex]!);
          if (!candidate) continue;
          if (!withinBounds(candidate, bounds) || overlapsBlocker(candidate, blockers)) continue;
          const length = Math.max(candidate.width, candidate.depth);
          if (!best || length < best.length) best = { candidate, length };
        }
      }
    }
    // No legal link remains; keep the roads already joined rather than cutting
    // a street through a room.
    if (!best) break;
    const connector: RoomLayoutRoadway = { id: `${idPrefix}-${connectors.length + 1}`, ...best.candidate, kind: "small" };
    connectors.push(connector);
    network.push(connector);
  }

  return connectors;
}
