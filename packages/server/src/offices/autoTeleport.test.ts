import assert from "node:assert/strict";
import test from "node:test";
import { isPositionWalkable, WORLD, type RoomLayoutZone, type WorldConfig } from "@gammyverse/shared";
import { autoMoveLandingPoint } from "./autoTeleport.js";

const TEST_WORLD_SIZE_M = 20;
const BLOCKING_OBSTACLE = { x: 0, z: 0, width: 2, depth: 2 };
const PRIVATE_ZONE: RoomLayoutZone = { id: "private", kind: "private", name: "Private", x: 0, z: 0, width: 6, depth: 6, color: "#789" };

function world(overrides: Partial<WorldConfig> = {}): WorldConfig {
  return {
    ...WORLD,
    width: TEST_WORLD_SIZE_M,
    depth: TEST_WORLD_SIZE_M,
    playerRadius: 0.2,
    obstacles: [],
    walls: [],
    collisionGrid: undefined,
    ...overrides,
  };
}

test("teleport keeps an already walkable destination", () => {
  const target = { x: 2.25, z: -1.75 };
  assert.deepEqual(autoMoveLandingPoint(target, world()), target);
});

test("teleport snaps a blocked click to the nearest walkable point", () => {
  const landing = autoMoveLandingPoint({ x: 0, z: 0 }, world({ obstacles: [BLOCKING_OBSTACLE] }));
  assert.ok(landing);
  assert.ok(isPositionWalkable(landing, world({ obstacles: [BLOCKING_OBSTACLE] })));
  assert.ok(Math.hypot(landing.x, landing.z) <= 1.75);
});

test("teleport landing remains within the destination zone", () => {
  const landing = autoMoveLandingPoint({ x: 0, z: 0 }, world({ obstacles: [BLOCKING_OBSTACLE] }), PRIVATE_ZONE);
  assert.ok(landing);
  assert.ok(Math.abs(landing.x - PRIVATE_ZONE.x) <= PRIVATE_ZONE.width / 2 - 0.2 - 0.12);
  assert.ok(Math.abs(landing.z - PRIVATE_ZONE.z) <= PRIVATE_ZONE.depth / 2 - 0.2 - 0.12);
});

test("teleport reports no landing point when the entire map is blocked", () => {
  const smallWorld = world({ width: 4, depth: 4 });
  const fullyBlocked = { x: 0, z: 0, width: 8, depth: 8 };
  assert.equal(autoMoveLandingPoint({ x: 0, z: 0 }, { ...smallWorld, obstacles: [fullyBlocked] }), null);
});
