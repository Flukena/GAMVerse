import assert from "node:assert/strict";
import test from "node:test";
import { WORLD, isPositionWalkable, makeBlockerGrid, movePlayer, type WorldConfig } from "./index.js";

const walls = [{ x: -2, z: 0, width: 0.25, depth: 10 }];
const obstacles = [
  { x: 2, z: 2, width: 4, depth: 3, playerClearanceRadius: 0.2 },
  { x: 3, z: -4, width: 2, depth: 2 },
];
const vehicles = [
  { x: -4, z: -3, width: 3, depth: 2, vehiclePropId: "own" },
  { x: 4, z: -3, width: 3, depth: 2, vehiclePropId: "other" },
];
const accessOverlay = [{ x: 0, z: 6, width: 12, depth: 1 }];

function world(): WorldConfig {
  return { ...WORLD, width: 24, depth: 24, playerRadius: 0.48, walls, obstacles, collisionGrid: undefined };
}

test("indexed queries match unindexed geometry across static, dynamic, access and excluded layers", () => {
  const plain = world();
  for (const excludedVehiclePropId of [undefined, "own", "other"]) {
    const reference = { ...plain, obstacles: [...obstacles, ...vehicles, ...accessOverlay], excludedVehiclePropId };
    for (const cellSize of [1, 4, 8]) {
      const indexed = {
        ...plain, collisionGrid: makeBlockerGrid([...walls, ...obstacles], cellSize),
        dynamicCollisionGrid: makeBlockerGrid(vehicles, cellSize), accessOverlay, excludedVehiclePropId,
      };
      const fallback = { ...indexed, collisionGrid: undefined };
      for (let x = -12; x <= 12; x += 0.5) {
        for (let z = -12; z <= 12; z += 0.5) {
          const expected = isPositionWalkable({ x, z }, reference);
          assert.equal(isPositionWalkable({ x, z }, indexed), expected, `indexed ${x},${z}/${cellSize}/${excludedVehiclePropId}`);
          assert.equal(isPositionWalkable({ x, z }, fallback), expected, `fallback ${x},${z}/${cellSize}/${excludedVehiclePropId}`);
        }
      }
      for (const input of [{ x: 1, z: 0 }, { x: 1, z: 1 }, { x: -1, z: -1 }]) {
        assert.deepEqual(movePlayer({ x: -6, z: -3 }, input, 1, indexed), movePlayer({ x: -6, z: -3 }, input, 1, reference));
      }
    }
  }
});

test("collision queries short-circuit without visiting unrelated buckets or blockers", () => {
  const first = { x: 0, z: 0, width: 4, depth: 4 };
  const neverRead = { get x(): number { throw new Error("unneeded blocker inspection"); }, z: 0, width: 1, depth: 1 };
  assert.equal(isPositionWalkable({ x: 0, z: 0 }, { ...world(), walls: [first, neverRead] }), false);
  const cells = new Map<string, readonly typeof first[]>();
  cells.set("-1,-1", [first]);
  Object.defineProperty(cells, "get", { value(key: string) {
    assert.equal(key, "-1,-1", "later buckets must not be collected after a collision");
    return [first];
  } });
  assert.equal(isPositionWalkable({ x: 0, z: 0 }, { ...world(), collisionGrid: { cellSize: 8, cells } }), false);
});

test("boundaries reject invalid positions and preserve exact tangency and custom clearance", () => {
  const base = { ...world(), walls: [], obstacles: [] };
  for (const x of [NaN, Infinity, -Infinity]) assert.equal(isPositionWalkable({ x, z: 0 }, base), false);
  const obstacle = { x: 0, z: 0, width: 2, depth: 2, playerClearanceRadius: 0.25 };
  const configured = { ...base, obstacles: [obstacle], collisionGrid: makeBlockerGrid([obstacle]) };
  assert.equal(isPositionWalkable({ x: 1.25, z: 0 }, configured), true);
  assert.equal(isPositionWalkable({ x: 1.249, z: 0 }, configured), false);
  assert.equal(isPositionWalkable({ x: base.width / 2 - base.playerRadius, z: 0 }, base), true);
  assert.equal(isPositionWalkable({ x: base.width / 2, z: 0 }, base), false);
});
