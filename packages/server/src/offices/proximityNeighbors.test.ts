import assert from "node:assert/strict";
import test from "node:test";
import { proximityNeighbors, PROXIMITY_EXIT_MARGIN_BLOCKS } from "./proximityNeighbors.js";

type Person = readonly [string, { x: number; z: number }];
function bruteForce(people: readonly Person[], previous: ReadonlyMap<string, ReadonlySet<string>>, radius: number) {
  const graph = new Map(people.map(([id]) => [id, new Set<string>()]));
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const [a, first] = people[i]!;
    const [b, second] = people[j]!;
    if (Math.hypot(first.x - second.x, first.z - second.z) <= radius + (previous.get(a)?.has(b) ? 0.5 : 0)) {
      graph.get(a)!.add(b); graph.get(b)!.add(a);
    }
  }
  return graph;
}
function components(graph: ReadonlyMap<string, ReadonlySet<string>>) {
  const visited = new Set<string>(); const result: string[][] = [];
  for (const [id, adjacent] of graph) {
    if (visited.has(id) || !adjacent.size) continue;
    const pending = [id]; const component: string[] = [];
    while (pending.length) {
      const next = pending.pop()!; if (visited.has(next)) continue;
      visited.add(next); component.push(next);
      for (const neighbor of graph.get(next)!) if (!visited.has(neighbor)) pending.push(neighbor);
    }
    result.push(component);
  }
  return result;
}

test("bucket neighbors preserve exact ordered adjacency and BFS components against seeded brute force", () => {
  let seed = 197;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  let previous = new Map<string, Set<string>>();
  for (let frame = 0; frame < 100; frame++) {
    const people: Person[] = Array.from({ length: 100 }, (_, i) => [String(i), { x: (random() - 0.5) * 80, z: (random() - 0.5) * 80 }]);
    const expected = bruteForce(people, previous, 5);
    const actual = proximityNeighbors(people, previous, 5);
    assert.deepEqual(actual.neighbors, expected);
    assert.deepEqual([...actual.neighbors].map(([id, neighbors]) => [id, [...neighbors]]), [...expected].map(([id, neighbors]) => [id, [...neighbors]]));
    assert.deepEqual(components(actual.neighbors), components(expected));
    assert.ok(actual.candidatePairCount <= actual.possiblePairCount);
    previous = expected;
  }
});

test("bucket edges include exact join/exit radii across negative boundaries and remove disconnected sessions", () => {
  assert.equal(PROXIMITY_EXIT_MARGIN_BLOCKS, 0.5);
  const previous = new Map([["a", new Set(["b", "gone"])], ["b", new Set(["a"])]]);
  const people: Person[] = [["a", { x: -5.5, z: 0 }], ["b", { x: 0, z: 0 }], ["c", { x: 0, z: 5 }], ["d", { x: 0, z: 10.000001 }]];
  const result = proximityNeighbors(people, previous, 5);
  assert.deepEqual(result.neighbors, bruteForce(people, previous, 5));
  assert.deepEqual([...result.neighbors.get("a")!], ["b"]);
  assert.deepEqual([...result.neighbors.get("b")!], ["a", "c"]);
  assert.equal(result.neighbors.has("gone"), false);
});

test("sparse layouts avoid distance checks while dense layouts retain every pair", () => {
  const sparse: Person[] = Array.from({ length: 200 }, (_, i) => [String(i), { x: i * 20, z: 0 }]);
  const result = proximityNeighbors(sparse, new Map(), 5);
  assert.equal(result.candidatePairCount, 0);
  assert.equal(result.possiblePairCount, 19900);
  const dense: Person[] = sparse.map(([id]) => [id, { x: 0, z: 0 }]);
  assert.equal(proximityNeighbors(dense, new Map(), 5).candidatePairCount, 19900);
});
