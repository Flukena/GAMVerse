import assert from "node:assert/strict";
import test from "node:test";
import { CAMPUS_WORLD, PlayerState, type RoomLayout, type RoomLayoutZone, type WorldConfig } from "@gammyverse/shared";
import { OfficeRoom } from "./OfficeRoom.js";

const SESSION_ID = "guest-session";
const VEHICLE_ID = "vehicle-speedster";
const CAR = { id: "car", asset: VEHICLE_ID, x: 0, z: 0, rotation: 0, width: 2.4, depth: 4.2, collision: true };
const DENIED_ZONE: RoomLayoutZone = { id: "locked-desk", name: "Private desk", kind: "private", x: 2, z: 0, width: 2, depth: 8, color: "#ffffff" };
const BASE_WORLD: WorldConfig = { ...CAMPUS_WORLD, width: 20, depth: 20, walls: [], obstacles: [], collisionGrid: undefined, spawnPoints: [{ x: 0, z: 0 }] };
type VehicleExitRoom = {
  world: WorldConfig;
  mapLayout: RoomLayout;
  mapConfig: unknown;
  lockedZoneIds: Set<string>;
  vehicleWorldsBySessionId: Map<string, WorldConfig>;
  exitVehicle(sessionId: string, player: PlayerState): void;
};
function fixture(zone: RoomLayoutZone) {
  const room = new OfficeRoom();
  const internal = room as unknown as VehicleExitRoom;
  internal.world = BASE_WORLD;
  internal.mapLayout = { version: 1, props: [CAR], zones: [zone], walls: [], doors: [], dimensions: { width: BASE_WORLD.width, depth: BASE_WORLD.depth } };
  internal.mapConfig = { version: 1, layout: internal.mapLayout };
  internal.lockedZoneIds.add(zone.id);
  internal.vehicleWorldsBySessionId.set(SESSION_ID, BASE_WORLD);
  const player = new PlayerState();
  player.username = "guest";
  player.x = 0;
  player.z = 0;
  player.vehicleId = VEHICLE_ID;
  player.vehicleMode = "manual";
  player.vehiclePropId = CAR.id;
  room.state.players.set(SESSION_ID, player);
  return { room, internal, player };
}
test("actual vehicle exit cannot land in a locked private zone without admission", () => {
  const f = fixture(DENIED_ZONE);
  try {
    f.internal.exitVehicle(SESSION_ID, f.player);
    const inside = Math.abs(f.player.x - DENIED_ZONE.x) <= DENIED_ZONE.width / 2 && Math.abs(f.player.z - DENIED_ZONE.z) <= DENIED_ZONE.depth / 2;
    assert.equal(inside, false);
    assert.equal(f.player.vehicleId, "");
  } finally { f.room.clock.stop(); }
});
test("actual vehicle exit keeps vehicle and position when every landing and spawn is denied", () => {
  const f = fixture({ ...DENIED_ZONE, x: 0, width: BASE_WORLD.width, depth: BASE_WORLD.depth });
  try {
    f.internal.exitVehicle(SESSION_ID, f.player);
    assert.equal(f.player.vehicleId, VEHICLE_ID);
    assert.equal(f.player.vehicleMode, "manual");
    assert.deepEqual({ x: f.player.x, z: f.player.z }, { x: 0, z: 0 });
  } finally { f.room.clock.stop(); }
});
