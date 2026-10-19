import assert from "node:assert/strict";
import test from "node:test";
import { WORLD, type RoomLayoutProp, type RoomLayoutZone, type WorldConfig } from "@gammyverse/shared";
import { findSeatApproachRoute } from "./seatApproachRoute.js";

const WORLD_SIZE_M = 20;
const PLAYER_RADIUS_M = 0.2;
const ZONE_SIZE_M = 10;
const CHAIR_ASSET = "chair";
const NON_SEAT_ASSET = "desk";
const CHAIR_ID = "chair";
const OTHER_CHAIR_ID = "other-chair";
const FIRST_SEAT_ID = `${CHAIR_ID}::seat:0`;
const SECOND_SEAT_ID = `${CHAIR_ID}::seat:1`;
const THIRD_SEAT_ID = `${CHAIR_ID}::seat:2`;
const OTHER_FIRST_SEAT_ID = `${OTHER_CHAIR_ID}::seat:0`;
const START = { x: 0, z: -3 };
const SIDE_START = { x: 3, z: 0 };
const WALL_START = { x: -5, z: 0 };
const ROTATED_START = { x: 0, z: 5 };
const ZONE: RoomLayoutZone = { id: "zone", name: "Zone", kind: "meeting", x: 0, z: 0, width: ZONE_SIZE_M, depth: ZONE_SIZE_M, color: "#ffffff" };
const NEAR_APPROACH = { x: 0, z: -0.5 };
const SIDE_APPROACH = { x: 0.5, z: 0 };
const ROTATED_FIRST_ANCHOR_APPROACH = { x: -0.5, z: 1 };
const BOUNDARY_X_M = ZONE_SIZE_M / 2;
const OUTSIDE_X_M = BOUNDARY_X_M + 0.1;
const BENCH_WIDTH_M = 3;
const QUARTER_TURN_RAD = Math.PI / 2;
const OTHER_X_M = 4;
const ORIGINAL_CHAIR_X_M = -4;
const WORLD_BLOCKING_WALL = { x: 0, z: 0, width: 0.2, depth: WORLD_SIZE_M };

function chair(overrides: Partial<RoomLayoutProp> = {}): RoomLayoutProp {
  return { id: CHAIR_ID, asset: CHAIR_ASSET, x: 0, z: 0, width: 1, depth: 1, rotation: 0, collision: true, ...overrides };
}

function world(walls: WorldConfig["walls"] = []): WorldConfig {
  return { ...WORLD, width: WORLD_SIZE_M, depth: WORLD_SIZE_M, playerRadius: PLAYER_RADIUS_M, walls, obstacles: [], collisionGrid: undefined };
}

test("only catalog seats whose centers lie inside the zone are candidates", () => {
  const props = [chair({ id: OTHER_CHAIR_ID, x: OUTSIDE_X_M }), chair({ x: BOUNDARY_X_M, width: BENCH_WIDTH_M })];
  const result = findSeatApproachRoute(START, ZONE, props, world(), new Set(), { x: OUTSIDE_X_M, z: 0 });
  assert.equal(result?.propId, FIRST_SEAT_ID);
  assert.equal(result?.zoneId, ZONE.id);
});

test("empty props and non-seat catalog props provide no candidate", () => {
  assert.equal(findSeatApproachRoute(START, ZONE, [], world(), new Set()), null);
  assert.equal(findSeatApproachRoute(START, ZONE, [chair({ asset: NON_SEAT_ASSET })], world(), new Set()), null);
});

test("preferred point selects the prop before approach distance from the start", () => {
  const props = [chair({ x: ORIGINAL_CHAIR_X_M }), chair({ id: OTHER_CHAIR_ID, x: OTHER_X_M })];
  const start = { x: ORIGINAL_CHAIR_X_M, z: START.z };
  const preferred = { x: OTHER_X_M, z: 0 };
  assert.equal(findSeatApproachRoute(start, ZONE, props, world(), new Set())?.propId, FIRST_SEAT_ID);
  assert.equal(findSeatApproachRoute(start, ZONE, props, world(), new Set(), preferred)?.propId, OTHER_FIRST_SEAT_ID);
});

test("the closest approach side is selected using the start position", () => {
  assert.deepEqual(findSeatApproachRoute(START, ZONE, [chair()], world(), new Set())?.points.at(-1), NEAR_APPROACH);
  assert.deepEqual(findSeatApproachRoute(SIDE_START, ZONE, [chair()], world(), new Set())?.points.at(-1), SIDE_APPROACH);
});

test("rotation transforms local anchor offsets before approach sorting", () => {
  const rotated = chair({ width: BENCH_WIDTH_M, rotation: QUARTER_TURN_RAD });
  const result = findSeatApproachRoute(ROTATED_START, ZONE, [rotated], world(), new Set());
  assert.equal(result?.propId, FIRST_SEAT_ID);
  assert.deepEqual(result?.points.at(-1), ROTATED_FIRST_ANCHOR_APPROACH);
});

test("occupied canonical references skip anchors in their stable order", () => {
  const bench = chair({ width: BENCH_WIDTH_M });
  assert.equal(findSeatApproachRoute(START, ZONE, [bench], world(), new Set([FIRST_SEAT_ID]))?.propId, SECOND_SEAT_ID);
  assert.equal(findSeatApproachRoute(START, ZONE, [bench], world(), new Set([FIRST_SEAT_ID, SECOND_SEAT_ID]))?.propId, THIRD_SEAT_ID);
  assert.equal(findSeatApproachRoute(START, ZONE, [bench], world(), new Set([FIRST_SEAT_ID, SECOND_SEAT_ID, THIRD_SEAT_ID])), null);
});

test("legacy prop occupancy blocks only the first anchor", () => {
  const bench = chair({ width: BENCH_WIDTH_M });
  assert.equal(findSeatApproachRoute(START, ZONE, [bench], world(), new Set([CHAIR_ID]))?.propId, SECOND_SEAT_ID);
  assert.equal(findSeatApproachRoute(START, ZONE, [bench], world(), new Set([CHAIR_ID, SECOND_SEAT_ID]))?.propId, THIRD_SEAT_ID);
});

test("an occupied chair falls back to the next prop", () => {
  const props = [chair(), chair({ id: OTHER_CHAIR_ID, x: OTHER_X_M })];
  assert.equal(findSeatApproachRoute(START, ZONE, props, world(), new Set([FIRST_SEAT_ID]))?.propId, OTHER_FIRST_SEAT_ID);
});

test("seats across an impassable wall return no route", () => {
  assert.equal(findSeatApproachRoute(WALL_START, ZONE, [chair({ x: OTHER_X_M })], world([WORLD_BLOCKING_WALL]), new Set()), null);
});
