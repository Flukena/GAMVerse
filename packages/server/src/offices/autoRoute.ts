import { isPositionWalkable, type Position, type WorldConfig } from "@gammyverse/shared";

const GRID_STEP_M = 0.5;
const NEAREST_CELL_SEARCH_RADIUS_CELLS = 16;
const EDGE_SAMPLE_STEP_M = 0.12;
const HEAP_CHILD_COUNT = 2;
const GRID_KEY_SEPARATOR = ",";
const DIRECTIONS_CELLS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

type GridCell = { x: number; z: number };
type GridNode = GridCell & { key: string; f: number };
type CellCandidate = GridCell & { distance: number };

function keyOf(x: number, z: number) {
  return `${x}${GRID_KEY_SEPARATOR}${z}`;
}

function positionOf({ x, z }: GridCell): Position {
  return { x: x * GRID_STEP_M, z: z * GRID_STEP_M };
}

function walkableRing(position: Position, radius: number, world: WorldConfig) {
  const centerX = Math.round(position.x / GRID_STEP_M);
  const centerZ = Math.round(position.z / GRID_STEP_M);
  const candidates: CellCandidate[] = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
      const cell = { x: centerX + dx, z: centerZ + dz };
      const candidate = positionOf(cell);
      if (isPositionWalkable(candidate, world)) {
        candidates.push({ ...cell, distance: (candidate.x - position.x) ** 2 + (candidate.z - position.z) ** 2 });
      }
    }
  }
  return candidates;
}

function nearestWalkableCell(position: Position, world: WorldConfig) {
  for (let radius = 0; radius <= NEAREST_CELL_SEARCH_RADIUS_CELLS; radius += 1) {
    const candidates = walkableRing(position, radius, world);
    if (candidates.length) return candidates.sort((a, b) => a.distance - b.distance)[0]!;
  }
  return null;
}

class RouteHeap {
  private readonly nodes: GridNode[] = [];

  get length() { return this.nodes.length; }

  push(node: GridNode) {
    this.nodes.push(node);
    let index = this.nodes.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / HEAP_CHILD_COUNT);
      if (this.nodes[parent]!.f <= this.nodes[index]!.f) break;
      this.swap(parent, index);
      index = parent;
    }
  }

  pop() {
    const first = this.nodes[0]!;
    const last = this.nodes.pop()!;
    if (this.nodes.length) {
      this.nodes[0] = last;
      this.sinkRoot();
    }
    return first;
  }

  private sinkRoot() {
    let index = 0;
    while (true) {
      const left = index * HEAP_CHILD_COUNT + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.nodes.length && this.nodes[left]!.f < this.nodes[smallest]!.f) smallest = left;
      if (right < this.nodes.length && this.nodes[right]!.f < this.nodes[smallest]!.f) smallest = right;
      if (smallest === index) return;
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(first: number, second: number) {
    [this.nodes[first], this.nodes[second]] = [this.nodes[second]!, this.nodes[first]!];
  }
}

class RouteSearch {
  private readonly heap = new RouteHeap();
  private readonly bestCost = new Map<string, number>();
  private readonly parentByKey = new Map<string, string>();
  private readonly closed = new Set<string>();
  private readonly sourceKey: string;
  private readonly targetKey: string;

  constructor(private readonly source: GridCell, private readonly target: GridCell, private readonly world: WorldConfig) {
    this.sourceKey = keyOf(source.x, source.z);
    this.targetKey = keyOf(target.x, target.z);
    this.bestCost.set(this.sourceKey, 0);
    this.heap.push({ ...source, key: this.sourceKey, f: this.heuristic(source.x, source.z) });
  }

  find(): Position[] | null {
    if (this.sourceKey === this.targetKey) return [];
    // Bound search by the office grid so long campus wall detours remain reachable.
    const maxIterations = Math.ceil(this.world.width / GRID_STEP_M) * Math.ceil(this.world.depth / GRID_STEP_M) + 1;
    let iterations = 0;
    while (this.heap.length && iterations < maxIterations) {
      iterations += 1;
      const current = this.heap.pop();
      if (this.closed.has(current.key)) continue;
      if (current.key === this.targetKey) return this.route();
      this.closed.add(current.key);
      this.expand(current);
    }
    return null;
  }

  private heuristic(x: number, z: number) {
    const dx = Math.abs(this.target.x - x);
    const dz = Math.abs(this.target.z - z);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  }

  private expand(current: GridNode) {
    const currentCost = this.bestCost.get(current.key)!;
    for (const [dx, dz] of DIRECTIONS_CELLS) {
      const x = current.x + dx;
      const z = current.z + dz;
      const key = keyOf(x, z);
      if (this.closed.has(key) || !isAutoRouteEdgeWalkable(positionOf(current), positionOf({ x, z }), this.world)) continue;
      const nextCost = currentCost + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1);
      if (nextCost >= (this.bestCost.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      this.bestCost.set(key, nextCost);
      this.parentByKey.set(key, current.key);
      this.heap.push({ x, z, key, f: nextCost + this.heuristic(x, z) });
    }
  }

  private route() {
    const route: Position[] = [];
    let key = this.targetKey;
    while (key !== this.sourceKey) {
      const [x, z] = key.split(GRID_KEY_SEPARATOR).map(Number) as [number, number];
      route.push(positionOf({ x, z }));
      key = this.parentByKey.get(key)!;
    }
    route.reverse();
    return smoothAutoRoute(positionOf(this.source), route, this.world);
  }
}

export function findAutoRoute(start: Position, requestedTarget: Position, world: WorldConfig): Position[] | null {
  const source = nearestWalkableCell(start, world);
  const target = nearestWalkableCell(requestedTarget, world);
  if (!source || !target) return null;
  return new RouteSearch(source, target, world).find();
}

function smoothAutoRoute(start: Position, route: Position[], world: WorldConfig): Position[] {
  if (route.length < 2) return route;
  const result: Position[] = [];
  let anchor = start;
  let firstCandidate = 0;
  while (firstCandidate < route.length) {
    let furthestVisible = firstCandidate;
    for (let candidate = firstCandidate; candidate < route.length; candidate += 1) {
      if (isAutoRouteEdgeWalkable(anchor, route[candidate]!, world)) furthestVisible = candidate;
    }
    result.push(route[furthestVisible]!);
    anchor = route[furthestVisible]!;
    firstCandidate = furthestVisible + 1;
  }
  return result;
}

function isAutoRouteEdgeWalkable(first: Position, second: Position, world: WorldConfig) {
  const distance = Math.hypot(second.x - first.x, second.z - first.z);
  const samples = Math.max(1, Math.ceil(distance / EDGE_SAMPLE_STEP_M));
  for (let index = 1; index <= samples; index += 1) {
    const progress = index / samples;
    if (!isPositionWalkable({
      x: first.x + (second.x - first.x) * progress,
      z: first.z + (second.z - first.z) * progress,
    }, world)) return false;
  }
  return true;
}
