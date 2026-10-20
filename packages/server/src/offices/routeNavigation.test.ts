import assert from "node:assert/strict";
import test from "node:test";
import { campusWorldFromConfig, generateCampusMap, isPositionWalkable, WORLD, type Position, type RoomLayoutZone } from "@gammyverse/shared";
import { restrictedZoneWorld } from "./privateMovement.js";
import { findAutoRoute } from "./routeNavigation.js";

const GENERATED_OFFICE = generateCampusMap({ totalPeople: 150, peoplePerTeam: 15, teamCount: 10, seed: 12345 });
const OFFICE_WORLD = { ...campusWorldFromConfig({ version: 1, layout: GENERATED_OFFICE.layout }), playerRadius: 0.48 };
const ROUTE_START = GENERATED_OFFICE.layout.spawnPoint!;
const SAMPLE_DESTINATIONS: Position[] = [
  { x: -96, z: -108 },
  { x: 0, z: -114 },
  { x: 50, z: 30 },
  { x: 60, z: 10 },
  { x: 0, z: -100 },
];

test("a straight 200-block trip remains one fast route segment", () => {
  const openWorld = { ...OFFICE_WORLD, walls: [], obstacles: [], collisionGrid: undefined };
  const start = { x: -100, z: 0 };
  const destination = { x: 100, z: 0 };
  assert.deepEqual(findAutoRoute(start, destination, openWorld), [destination]);
});

test("route geometry treats a locked room as an obstacle", () => {
  const zone: RoomLayoutZone = { id: "locked", kind: "private", name: "Locked", x: 0, z: 0, width: 3, depth: 8, color: "#789" };
  const openWorld = { ...WORLD, width: 20, depth: 20, playerRadius: 0.48, walls: [], obstacles: [], collisionGrid: undefined };
  const routeWorld = restrictedZoneWorld(openWorld, [zone]);
  const route = findAutoRoute({ x: -8, z: 0 }, { x: 8, z: 0 }, routeWorld);
  assert.ok(route);
  let previous = { x: -8, z: 0 };
  for (const point of route) {
    const samples = Math.ceil(Math.hypot(point.x - previous.x, point.z - previous.z) / 0.1);
    for (let index = 0; index <= samples; index += 1) {
      const progress = index / samples;
      const sample = { x: previous.x + (point.x - previous.x) * progress, z: previous.z + (point.z - previous.z) * progress };
      assert.ok(Math.abs(sample.x - zone.x) > zone.width / 2 || Math.abs(sample.z - zone.z) > zone.depth / 2);
    }
    previous = point;
  }
});

test("walkability cache keeps signed coordinate columns and per-search access separate", () => {
  const openWorld = { ...WORLD, width: 30, depth: 30, playerRadius: 0.48, walls: [], obstacles: [], collisionGrid: undefined };
  const barrier = { x: 0, z: 0, width: 2, depth: 12 };
  for (const direction of [-1, 1]) {
    const start = { x: -10 * direction, z: -2 * direction };
    const destination = { x: 10 * direction, z: 2 * direction };
    const restricted = { ...openWorld, accessOverlay: [barrier] };
    const route = findAutoRoute(start, destination, restricted);
    assert.ok(route);
    assert.deepEqual(route.at(-1), destination);
    assert.ok(route.some(point => Math.abs(point.z) > 6), "opposite-sign cache keys must not bypass the barrier");
    let previous = start;
    for (const point of route) {
      const samples = Math.ceil(Math.hypot(point.x - previous.x, point.z - previous.z) / 0.1);
      for (let index = 0; index <= samples; index++) {
        const fraction = samples ? index / samples : 0;
        assert.ok(isPositionWalkable({ x: previous.x + (point.x - previous.x) * fraction, z: previous.z + (point.z - previous.z) * fraction }, restricted));
      }
      previous = point;
    }
    assert.deepEqual(findAutoRoute(start, destination, openWorld), [destination], "another caller's access must not remain cached");
    assert.equal(findAutoRoute(start, destination, { ...openWorld, accessOverlay: [{ ...barrier, depth: 40 }] }), null);
  }
});

function assertRouteWalkable(start: Position, route: Position[]) {
  let previous = start;
  for (const point of route) {
    const distance = Math.hypot(point.x - previous.x, point.z - previous.z);
    const samples = Math.ceil(distance / 0.1);
    for (let index = 0; index <= samples; index += 1) {
      const progress = samples === 0 ? 0 : index / samples;
      assert.ok(isPositionWalkable({
        x: previous.x + (point.x - previous.x) * progress,
        z: previous.z + (point.z - previous.z) * progress,
      }, OFFICE_WORLD));
    }
    previous = point;
  }
}

test("generated campus destinations within 200 blocks produce short, walkable routes", () => {
  for (const destination of SAMPLE_DESTINATIONS) {
    const distance = Math.hypot(destination.x - ROUTE_START.x, destination.z - ROUTE_START.z);
    assert.ok(distance <= 200, `sample destination must use auto-driving: ${distance}`);
    const route = findAutoRoute(ROUTE_START, destination, OFFICE_WORLD);
    assert.ok(route, `no route found to ${JSON.stringify(destination)}`);
    assert.ok(route.length < 20, `route was not smoothed: ${route.length} waypoints`);
    const finalPoint = route.at(-1) ?? ROUTE_START;
    assert.ok(Math.hypot(finalPoint.x - destination.x, finalPoint.z - destination.z) <= Math.SQRT2);
    assertRouteWalkable(ROUTE_START, route);
  }
});
