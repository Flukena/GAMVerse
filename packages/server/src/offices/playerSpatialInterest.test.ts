import assert from "node:assert/strict";
import test from "node:test";
import { PlayerState } from "@gammyverse/shared";
import { PlayerSpatialInterest } from "./playerSpatialInterest.js";

const FIRST_UPDATE_AT_MS = 100;
const MARKER_INTERVAL_MS = 1_000;
const BEFORE_DEADLINE_MS = FIRST_UPDATE_AT_MS + MARKER_INTERVAL_MS - 1;
const DEADLINE_MS = FIRST_UPDATE_AT_MS + MARKER_INTERVAL_MS;
const INITIAL_POSITION = { x: 12, z: -8, rotation: Math.PI };
const MOVED_POSITION = { x: 24, z: -16, rotation: Math.PI / 2 };
const VEHICLE_POSITION = { vehiclePropX: 30, vehiclePropZ: -40, vehiclePropRotation: -Math.PI };
const PLAYER_SESSION_ID = "observer";

function fixture() {
  const interest = new PlayerSpatialInterest();
  const player = new PlayerState();
  Object.assign(player, INITIAL_POSITION, VEHICLE_POSITION);
  const players = new Map([[PLAYER_SESSION_ID, player]]);
  return { interest, player, players };
}

function markerPosition(player: PlayerState) {
  return { x: player.markerX, z: player.markerZ, rotation: player.markerRotation };
}

test("the first marker projection copies the authoritative player position", () => {
  const { interest, player, players } = fixture();
  interest.updateMarkers(players, FIRST_UPDATE_AT_MS);
  assert.deepEqual(markerPosition(player), INITIAL_POSITION);
});

test("marker projection retains its previous position before the deadline", () => {
  const { interest, player, players } = fixture();
  interest.updateMarkers(players, FIRST_UPDATE_AT_MS);
  Object.assign(player, MOVED_POSITION);
  interest.updateMarkers(players, BEFORE_DEADLINE_MS);
  assert.deepEqual(markerPosition(player), INITIAL_POSITION);
});

test("marker projection updates exactly at each one-second deadline", () => {
  const { interest, player, players } = fixture();
  interest.updateMarkers(players, FIRST_UPDATE_AT_MS);
  Object.assign(player, MOVED_POSITION);
  interest.updateMarkers(players, DEADLINE_MS);
  assert.deepEqual(markerPosition(player), MOVED_POSITION);
  Object.assign(player, INITIAL_POSITION);
  interest.updateMarkers(players, DEADLINE_MS + MARKER_INTERVAL_MS);
  assert.deepEqual(markerPosition(player), INITIAL_POSITION);
});

test("marker projection leaves authoritative player and vehicle coordinates unchanged", () => {
  const { interest, player, players } = fixture();
  interest.updateMarkers(players, FIRST_UPDATE_AT_MS);
  assert.deepEqual({ x: player.x, z: player.z, rotation: player.rotation }, INITIAL_POSITION);
  assert.deepEqual({ vehiclePropX: player.vehiclePropX, vehiclePropZ: player.vehiclePropZ, vehiclePropRotation: player.vehiclePropRotation }, VEHICLE_POSITION);
});
