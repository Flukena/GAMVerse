import assert from "node:assert/strict";
import test from "node:test";
import { CAMPUS_WORLD, campusWorldFromConfig, isPositionWalkable, makeBlockerGrid, type RoomLayoutZone, type WorldConfig } from "@gammyverse/shared";
import { findAccessibleSpawn, restrictedZoneWorld } from "./privateMovement.js";

const PRIVATE_ZONE: RoomLayoutZone = { id: "private", name: "Private", kind: "private", x: 0, z: 0, width: 4, depth: 4, color: "#ffffff" };
const BASE_WORLD: WorldConfig = { ...CAMPUS_WORLD, width: 20, depth: 20, walls: [], obstacles: [], collisionGrid: undefined, spawnPoints: [{ x: 0, z: 0 }, { x: 6, z: 0 }] };

test("restricted worlds retain collision geometry and overlay denied zones on the existing collision cache", () => {
  const cached = campusWorldFromConfig({ version: 1, layout: {
    version: 1, props: [], zones: [], walls: [], doors: [],
    dimensions: { width: BASE_WORLD.width, depth: BASE_WORLD.depth },
  } });
  assert.ok(cached.collisionGrid);
  assert.equal(isPositionWalkable({ x: 0, z: 0 }, cached), true);
  const world = restrictedZoneWorld(cached, [PRIVATE_ZONE]);
  assert.notEqual(world.collisionGrid, cached.collisionGrid);
  assert.equal(world.collisionGrid?.cellSize, cached.collisionGrid.cellSize);
  assert.equal(isPositionWalkable({ x: 0, z: 0 }, world), false);
  assert.equal(isPositionWalkable({ x: 6, z: 0 }, world), true);
  assert.equal(world.walls, cached.walls);
  assert.equal(BASE_WORLD.obstacles.length, 0);
});
test("spawn selection skips denied and occupied points and keeps a walkable public candidate", () => {
  const world = restrictedZoneWorld(BASE_WORLD, [PRIVATE_ZONE]);
  const spawn = findAccessibleSpawn([{ x: 6, z: 0 }], world);
  assert.ok(spawn);
  assert.ok(isPositionWalkable(spawn, world));
  assert.ok(Math.hypot(spawn.x - 6, spawn.z) >= 0.9);
});
test("no accessible spawn returns null rather than an unsafe configured spawn", () => {
  const world = restrictedZoneWorld(BASE_WORLD, [{ ...PRIVATE_ZONE, width: BASE_WORLD.width, depth: BASE_WORLD.depth }]);
  assert.equal(findAccessibleSpawn([], world), null);
});


test("no denied zones preserve the original world identity and collision grid", () => {
  const cached = campusWorldFromConfig({ version: 1, layout: {
    version: 1, props: [], zones: [], walls: [], doors: [],
    dimensions: { width: BASE_WORLD.width, depth: BASE_WORLD.depth },
  } });
  assert.ok(cached.collisionGrid);
  const restricted = restrictedZoneWorld(cached, []);
  assert.equal(restricted, cached);
  assert.equal(restricted.collisionGrid, cached.collisionGrid);
});

test("restrictions preserve grid-only blockers, array geometry and the original grid cell size", () => {
  const gridOnly = { x: -6, z: 0, width: 1, depth: 1 };
  const wall = { x: 6, z: 0, width: 1, depth: 1 };
  const obstacle = { x: 0, z: 6, width: 1, depth: 1 };
  const cellSizeM = 4;
  const source: WorldConfig = { ...BASE_WORLD, walls: [wall], obstacles: [obstacle], collisionGrid: makeBlockerGrid([gridOnly, wall, obstacle], cellSizeM) };
  assert.equal(isPositionWalkable(gridOnly, source), false);
  const restricted = restrictedZoneWorld(source, [PRIVATE_ZONE]);
  for (const blocker of [gridOnly, wall, obstacle, PRIVATE_ZONE]) {
    assert.equal(isPositionWalkable(blocker, restricted), false);
  }
  assert.equal(isPositionWalkable({ x: 6, z: 6 }, restricted), true);
  assert.equal(restricted.collisionGrid?.cellSize, cellSizeM);
  assert.equal(source.collisionGrid?.cells.get("-2,0")?.includes(gridOnly), true);
  assert.notEqual(restricted.collisionGrid?.cells, source.collisionGrid?.cells);
  assert.equal(restricted.collisionGrid?.cells.get("-2,0"), source.collisionGrid?.cells.get("-2,0"));
  assert.equal(source.obstacles.length, 1);
});
