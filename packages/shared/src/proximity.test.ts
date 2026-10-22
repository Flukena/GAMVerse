import assert from "node:assert/strict";
import test from "node:test";
import { arePlayersNearby, CAMPUS_WORLD, campusWorldFromConfig, WORLD } from "./index.js";

const EXPECTED_PROXIMITY_RADIUS_M = 50;
const ORIGIN = { x: 0, z: 0 };
const INSIDE_DISTANCE_M = 49;
const OUTSIDE_DISTANCE_M = 51;

test("general, campus and saved-map worlds share the requested 50 m proximity radius", () => {
  assert.equal(WORLD.proximityRadius, EXPECTED_PROXIMITY_RADIUS_M);
  assert.equal(CAMPUS_WORLD.proximityRadius, EXPECTED_PROXIMITY_RADIUS_M);
  assert.equal(campusWorldFromConfig({ version: 1, layout: { version: 1, props: [], zones: [], walls: [], doors: [] } }).proximityRadius, EXPECTED_PROXIMITY_RADIUS_M);
});

test("shared proximity includes 49 m and the exact 50 m boundary, excluding 51 m", () => {
  assert.equal(arePlayersNearby(ORIGIN, { x: INSIDE_DISTANCE_M, z: 0 }), true);
  assert.equal(arePlayersNearby(ORIGIN, { x: EXPECTED_PROXIMITY_RADIUS_M, z: 0 }), true);
  assert.equal(arePlayersNearby(ORIGIN, { x: OUTSIDE_DISTANCE_M, z: 0 }), false);
});
