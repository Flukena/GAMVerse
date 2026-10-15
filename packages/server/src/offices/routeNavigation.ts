import { isPositionWalkable, ROOM_PROP_CATALOG, roomPropCollisionClearanceRadius, roomPropCollisionFootprint, roomPropSeatAnchors, roomPropSeatReference, type RoomLayout, type RoomLayoutZone, type WorldConfig } from "@gammyverse/shared";
import { RouteSearchBudget } from "./routeWorkBudget.js";

type Position = { x: number; z: number };

export function findSeatApproachRoute(start: Position, zone: RoomLayoutZone, props: RoomLayout["props"], world: WorldConfig, occupiedSeatIds: Set<string>, preferredPoint: Position = start, budget = new RouteSearchBudget()) {
  const seats = props
    .map((prop) => ({ prop, definition: ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset) }))
    .filter((entry) => entry.definition?.interaction === "sit"
      && Math.abs(entry.prop.x - zone.x) <= zone.width / 2
      && Math.abs(entry.prop.z - zone.z) <= zone.depth / 2)
    .sort((a, b) => Math.hypot(a.prop.x - preferredPoint.x, a.prop.z - preferredPoint.z) - Math.hypot(b.prop.x - preferredPoint.x, b.prop.z - preferredPoint.z));

  for (const { prop, definition } of seats) {
    if (budget.exhausted) return null;
    const localFootprint = roomPropCollisionFootprint({ ...prop, rotation: 0 });
    const seatClearance = roomPropCollisionClearanceRadius(prop, world.playerRadius);
    const halfWidth = localFootprint.width / 2 + seatClearance + 0.12;
    const halfDepth = localFootprint.depth / 2 + seatClearance + 0.12;
    const seatAnchors = roomPropSeatAnchors(prop, definition);
    for (const anchor of seatAnchors) {
      const seatId = roomPropSeatReference(prop.id, anchor.index);
      if (occupiedSeatIds.has(seatId) || occupiedSeatIds.has(prop.id) && anchor.index === 0) continue;
      const sideOffsets: Position[] = [
        { x: anchor.localX, z: -halfDepth }, { x: anchor.localX, z: halfDepth },
        { x: -halfWidth, z: anchor.localZ }, { x: halfWidth, z: anchor.localZ },
      ];
      const approaches = sideOffsets.map((offset) => ({
        x: prop.x + offset.x * Math.cos(prop.rotation) + offset.z * Math.sin(prop.rotation),
        z: prop.z - offset.x * Math.sin(prop.rotation) + offset.z * Math.cos(prop.rotation),
      })).sort((a, b) => Math.hypot(a.x - start.x, a.z - start.z) - Math.hypot(b.x - start.x, b.z - start.z));
      for (const approach of approaches) {
        const points = findAutoRoute(start, approach, world, budget);
        if (points) return { points, propId: seatId, zoneId: zone.id };
      }
    }
  }
  return null;
}

type GridNode = { x: number; z: number; key: string; f: number };

export function findAutoRoute(start: Position, requestedTarget: Position, world: WorldConfig, budget = new RouteSearchBudget()): Position[] | null {
  const step = 0.5;
  const keyOf = (x: number, z: number) => `${x},${z}`;
  const positionOf = (x: number, z: number): Position => ({ x: x * step, z: z * step });
  // Bound the search by the office's actual grid size. A fixed 100k ceiling
  // could stop before reaching rooms that require a long detour around walls
  // on the 200 × 250 m campus.
  const maxIterations = Math.ceil(world.width / step) * Math.ceil(world.depth / step) + 1;
  const nearestWalkableCell = (position: Position) => {
    const centerX = Math.round(position.x / step);
    const centerZ = Math.round(position.z / step);
    for (let radius = 0; radius <= 16; radius += 1) {
      if (budget.exhausted) return null;
      const candidates: Array<{ x: number; z: number; distance: number }> = [];
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          if (budget.exhausted) return null;
          const x = centerX + dx;
          const z = centerZ + dz;
          const candidate = positionOf(x, z);
          if (!isPositionWalkable(candidate, world)) continue;
          candidates.push({ x, z, distance: (candidate.x - position.x) ** 2 + (candidate.z - position.z) ** 2 });
        }
      }
      if (candidates.length) return candidates.sort((a, b) => a.distance - b.distance)[0]!;
    }
    return null;
  };

  const source = nearestWalkableCell(start);
  const target = nearestWalkableCell(requestedTarget);
  if (!source || !target) return null;
  const sourceKey = keyOf(source.x, source.z);
  const targetKey = keyOf(target.x, target.z);
  if (sourceKey === targetKey) return [];

  const heap: GridNode[] = [];
  const push = (node: GridNode) => {
    heap.push(node);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (heap[parent]!.f <= heap[index]!.f) break;
      [heap[parent], heap[index]] = [heap[index]!, heap[parent]!];
      index = parent;
    }
  };
  const pop = () => {
    const first = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1, right = left + 1;
        let smallest = index;
        if (left < heap.length && heap[left]!.f < heap[smallest]!.f) smallest = left;
        if (right < heap.length && heap[right]!.f < heap[smallest]!.f) smallest = right;
        if (smallest === index) break;
        [heap[index], heap[smallest]] = [heap[smallest]!, heap[index]!];
        index = smallest;
      }
    }
    return first;
  };
  const heuristic = (x: number, z: number) => {
    const dx = Math.abs(target.x - x), dz = Math.abs(target.z - z);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const bestCost = new Map<string, number>([[sourceKey, 0]]);
  const parentByKey = new Map<string, string>();
  const closed = new Set<string>();
  push({ x: source.x, z: source.z, key: sourceKey, f: heuristic(source.x, source.z) });
  const directions = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ] as const;
  let iterations = 0;
  while (heap.length && iterations < maxIterations) {
    if (budget.exhausted) return null;
    iterations += 1;
    const current = pop();
    if (closed.has(current.key)) continue;
    if (current.key === targetKey) {
      const route: Position[] = [];
      let key = targetKey;
      while (key !== sourceKey) {
        const [x, z] = key.split(",").map(Number) as [number, number];
        route.push(positionOf(x, z));
        key = parentByKey.get(key)!;
      }
      route.reverse();
      return smoothAutoRoute(positionOf(source.x, source.z), route, world, budget);
    }
    closed.add(current.key);
    const currentCost = bestCost.get(current.key)!;
    for (const [dx, dz] of directions) {
      const x = current.x + dx, z = current.z + dz;
      const key = keyOf(x, z);
      if (closed.has(key) || !isAutoRouteEdgeWalkable(positionOf(current.x, current.z), positionOf(x, z), world, budget)) continue;
      const nextCost = currentCost + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1);
      if (nextCost >= (bestCost.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      bestCost.set(key, nextCost);
      parentByKey.set(key, current.key);
      push({ x, z, key, f: nextCost + heuristic(x, z) });
    }
  }
  return null;
}

function smoothAutoRoute(start: Position, route: Position[], world: WorldConfig, budget: RouteSearchBudget): Position[] {
  if (route.length < 2) return route;
  const result: Position[] = [];
  let anchor = start;
  let firstCandidate = 0;
  while (firstCandidate < route.length) {
    let furthestVisible = firstCandidate;
    for (let candidate = firstCandidate; candidate < route.length; candidate += 1) {
      // Smoothing is optional: keep the already validated remaining grid path
      // when the computation deadline is reached.
      if (budget.exhausted) return [...result, ...route.slice(firstCandidate)];
      if (isAutoRouteEdgeWalkable(anchor, route[candidate]!, world, budget)) furthestVisible = candidate;
    }
    result.push(route[furthestVisible]!);
    anchor = route[furthestVisible]!;
    firstCandidate = furthestVisible + 1;
  }
  return result;
}

function isAutoRouteEdgeWalkable(first: Position, second: Position, world: WorldConfig, budget: RouteSearchBudget) {
  const distance = Math.hypot(second.x - first.x, second.z - first.z);
  const samples = Math.max(1, Math.ceil(distance / 0.12));
  for (let index = 1; index <= samples; index += 1) {
    if (budget.exhausted) return false;
    const progress = index / samples;
    if (!isPositionWalkable({
      x: first.x + (second.x - first.x) * progress,
      z: first.z + (second.z - first.z) * progress,
    }, world)) return false;
  }
  return true;
}
