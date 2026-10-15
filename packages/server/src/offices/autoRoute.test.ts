import assert from "node:assert/strict";
import test from "node:test";
import { isPositionWalkable, WORLD, type Position, type WorldConfig } from "@gammyverse/shared";
import { findAutoRoute } from "./autoRoute.js";

const WORLD_SIZE_M = 20;
const PLAYER_RADIUS_M = 0.2;
const SEGMENT_CHECK_STEP_M = 0.03;
const ORIGIN = { x: 0, z: 0 };
const START = { x: -3, z: 0 };
const TARGET = { x: 3, z: 0 };
const CORNER_OBSTACLE = { x: 0.5, z: 0.15, width: 0.3, depth: 0.3 };
const DIAGONAL_TARGET = { x: 1, z: 1 };
const NEARBY_SAME_CELL = { x: 0.1, z: -0.1 };
const BLOCKED_TARGET_OBSTACLE = { x: 0, z: 0, width: 0.2, depth: 0.2 };
const BLOCKED_TARGET_LANDING = { x: -0.5, z: 0 };
const OUT_OF_RANGE_TARGET = { x: WORLD_SIZE_M * 2, z: 0 };
const WALL = { x: 0, z: 0, width: 0.2, depth: 4 };

function world(walls: WorldConfig["walls"] = []): WorldConfig {
  return { ...WORLD, width: WORLD_SIZE_M, depth: WORLD_SIZE_M, playerRadius: PLAYER_RADIUS_M, walls, obstacles: [], collisionGrid: undefined };
}

function assertWalkableRoute(start: Position, route: Position[], routeWorld: WorldConfig) {
  let previous = start;
  for (const point of route) {
    const samples = Math.ceil(Math.hypot(point.x - previous.x, point.z - previous.z) / SEGMENT_CHECK_STEP_M);
    for (let sample = 0; sample <= samples; sample += 1) {
      const fraction = samples === 0 ? 0 : sample / samples;
      assert.ok(isPositionWalkable({ x: previous.x + (point.x - previous.x) * fraction, z: previous.z + (point.z - previous.z) * fraction }, routeWorld));
    }
    previous = point;
  }
}

test("an unobstructed route collapses to its destination", () => {
  assert.deepEqual(findAutoRoute(START, TARGET, world()), [TARGET]);
});

test("positions rounding to the same grid cell need no route", () => {
  assert.deepEqual(findAutoRoute(ORIGIN, NEARBY_SAME_CELL, world()), []);
});

test("a wall spanning the world makes the destination unreachable", () => {
  assert.equal(findAutoRoute(START, TARGET, world([{ ...WALL, depth: WORLD_SIZE_M }])), null);
});

test("a detour reaches the destination without crossing a wall", () => {
  const routeWorld = world([WALL]);
  const route = findAutoRoute(START, TARGET, routeWorld);
  assert.ok(route);
  assert.deepEqual(route.at(-1), TARGET);
  assert.ok(route.some(point => Math.abs(point.z) > WALL.depth / 2));
  assertWalkableRoute(START, route, routeWorld);
});

test("a blocked destination snaps to its closest walkable grid ring", () => {
  const routeWorld = world([BLOCKED_TARGET_OBSTACLE]);
  const route = findAutoRoute(START, ORIGIN, routeWorld);
  assert.ok(route);
  // Equal-distance candidates retain the original ascending X/Z ring order.
  assert.deepEqual(route.at(-1), BLOCKED_TARGET_LANDING);
  assertWalkableRoute(START, route, routeWorld);
});

test("a destination beyond the nearest-cell search range has no route", () => {
  assert.equal(findAutoRoute(START, OUT_OF_RANGE_TARGET, world()), null);
});

test("diagonal shortcuts cannot cut through an obstacle corner", () => {
  const routeWorld = world([CORNER_OBSTACLE]);
  const route = findAutoRoute(ORIGIN, DIAGONAL_TARGET, routeWorld);
  assert.ok(route);
  assert.deepEqual(route.at(-1), DIAGONAL_TARGET);
  assert.ok(route.length > 1);
  assertWalkableRoute(ORIGIN, route, routeWorld);
});
