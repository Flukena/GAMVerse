import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { CAMPUS_WORLD, isPositionWalkable, makeBlockerGrid, PlayerState, ROOM_PROP_CATALOG, type RoomLayout, type RoomLayoutProp, type WorldConfig } from "@gammyverse/shared";
import { realtimeRuntimeMetrics } from "../infra/realtimeRuntimeMetrics.js";
import { OfficeRoom } from "./OfficeRoom.js";
import { VehicleCollisionIndex } from "./vehicleCollisionIndex.js";
import { restrictedZoneWorld } from "./privateMovement.js";

const OFFICE_ID = "00000000-0000-4000-8000-000000000007";
const VEHICLE = ROOM_PROP_CATALOG.find((entry) => entry.vehicleId === "vehicle-speedster")!;
const car = (id: string, x: number): RoomLayoutProp => ({ id, asset: VEHICLE.asset, x, z: 0, width: VEHICLE.width, depth: VEHICLE.depth, rotation: 0, collision: true });
const layout = (props: RoomLayoutProp[]): RoomLayout => ({ version: 1, dimensions: { width: 50, depth: 50 }, props, walls: [], doors: [], zones: [] });

test("static map collision stays cached while vehicle spatial blockers move and filter only the driver's car", () => {
  const config = { version: 1, layout: layout([car("car-a", 0), car("car-b", 10)]) };
  const index = new VehicleCollisionIndex();
  const initial = index.update(config, config.layout, 1, new Map());
  assert.equal(isPositionWalkable({ x: 0, z: 0 }, initial), false);
  assert.equal(isPositionWalkable({ x: 10, z: 0 }, initial), false);

  const drivingA = { ...initial, excludedVehiclePropId: "car-a" };
  assert.equal(isPositionWalkable({ x: 0, z: 0 }, drivingA), true, "driver can start inside own vehicle footprint");
  assert.equal(isPositionWalkable({ x: 10, z: 0 }, drivingA), false, "other parked vehicle still blocks");
  const staticGrid = initial.collisionGrid;
  const dynamicGrid = initial.dynamicCollisionGrid;

  const moved = index.update(config, config.layout, 1, new Map([["car-a", { x: 4, z: 0, rotation: 0 }]]));
  assert.equal(moved.collisionGrid, staticGrid, "vehicle movement must not rebuild static map collision");
  assert.notEqual(moved.dynamicCollisionGrid, dynamicGrid, "changed vehicle pose refreshes dynamic buckets");
  assert.equal(isPositionWalkable({ x: 0, z: 0 }, moved), true, "old vehicle footprint is removed");
  assert.equal(isPositionWalkable({ x: 4, z: 0 }, moved), false, "new vehicle footprint blocks");
  assert.equal(index.update(config, config.layout, 1, new Map([["car-a", { x: 4, z: 0, rotation: 0 }]])), moved, "unchanged poses reuse the world and grid");

  const accessWorld = restrictedZoneWorld(moved, [{ id: "locked", kind: "meeting", name: "Locked", x: 15, z: 0, width: 4, depth: 4, color: "#ffffff" }]);
  assert.equal(accessWorld.dynamicCollisionGrid, moved.dynamicCollisionGrid, "access overlay preserves the dynamic vehicle layer");
  assert.equal(isPositionWalkable({ x: 15, z: 0 }, accessWorld), false, "locked-zone blockers layer with vehicle collision");
  assert.equal(isPositionWalkable({ x: 4, z: 0 }, accessWorld), false, "vehicle blockers remain under access overlays");

  const editedLayout = layout([car("car-a", 4), car("car-b", 16)]);
  const edited = index.update({ version: 1, layout: editedLayout }, editedLayout, 2, new Map());
  assert.notEqual(edited.collisionGrid, staticGrid, "accepted map revision rebuilds the static grid");
  assert.equal(isPositionWalkable({ x: 10, z: 0 }, edited), true, "old parked position is invalidated");
  assert.equal(isPositionWalkable({ x: 16, z: 0 }, edited), false, "edited map position is indexed");
});

test("dynamic-only collision worlds retain static array blockers and exclude only the driver's vehicle", () => {
  const world: WorldConfig = {
    ...CAMPUS_WORLD,
    width: 30,
    depth: 30,
    walls: [{ x: -8, z: 0, width: 1, depth: 4 }],
    obstacles: [{ x: -3, z: 0, width: 2, depth: 2 }],
    collisionGrid: undefined,
    dynamicCollisionGrid: makeBlockerGrid([
      { x: 3, z: 0, width: 2, depth: 2, vehiclePropId: "own-car" },
      { x: 8, z: 0, width: 2, depth: 2, vehiclePropId: "other-car" },
    ]),
    excludedVehiclePropId: "own-car",
  };
  assert.equal(isPositionWalkable({ x: -8, z: 0 }, world), false, "static wall array is still queried");
  assert.equal(isPositionWalkable({ x: -3, z: 0 }, world), false, "static obstacle array is still queried");
  assert.equal(isPositionWalkable({ x: 3, z: 0 }, world), true, "own dynamic vehicle is excluded");
  assert.equal(isPositionWalkable({ x: 8, z: 0 }, world), false, "other dynamic vehicles still block");
});

test("actual room ticks update vehicle buckets without rebuilding or parsing the whole map", async () => {
  const room = new OfficeRoom();
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {});
  mock.method(console, "info", () => {});
  let nowMs = 10_000;
  mock.method(performance, "now", () => nowMs);
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internal = room as unknown as {
      applyMapConfig(config: unknown, version: number): void;
      step(dt: number): void;
      exitVehicle(sessionId: string, player: PlayerState): boolean;
      world: WorldConfig;
      movementInputs: Map<string, { x: number; z: number; sprint: boolean; receivedAt: number }>;
    };
    const map = { version: 1, layout: layout([car("car-a", 0), car("car-b", 10)]) };
    internal.applyMapConfig(map, 2);
    for (const [id, propId, x] of [["alice", "car-a", 0], ["bob", "car-b", 10]] as const) {
      const player = new PlayerState();
      player.presence = "online";
      player.x = x; player.z = 0;
      player.vehicleId = VEHICLE.vehicleId!;
      player.vehicleMode = "manual";
      player.vehiclePropId = propId;
      player.vehiclePropX = x; player.vehiclePropZ = 0; player.vehiclePropRotation = 0;
      room.state.players.set(id, player);
      internal.movementInputs.set(id, { x: 0, z: 1, sprint: false, receivedAt: nowMs });
    }
    const before = realtimeRuntimeMetrics.snapshot().counters;
    internal.step(0.02);
    const after = realtimeRuntimeMetrics.snapshot().counters;
    assert.equal(after.mapParses, before.mapParses, "movement tick must not parse map config");
    assert.equal(after.vehicleWorldRebuilds, before.vehicleWorldRebuilds, "movement tick must not rebuild static worlds per driver");
    assert.equal(after.vehicleCollisionUpdates, before.vehicleCollisionUpdates + 1, "one dynamic index update handles both moving vehicles");
    assert.ok(room.state.players.get("alice")!.vehiclePropZ > 0);
    assert.ok(room.state.players.get("bob")!.vehiclePropZ > 0);

    const alice = room.state.players.get("alice")!;
    const parkedAt = { x: alice.vehiclePropX, z: alice.vehiclePropZ };
    assert.equal(internal.exitVehicle("alice", alice), true, "safe dismount succeeds with the own-car exclusion");
    assert.equal(alice.vehicleId, "");
    assert.equal(isPositionWalkable(parkedAt, internal.world), false, "dismounted vehicle becomes a blocking parked prop");

    internal.applyMapConfig({ version: 1, layout: layout([car("car-b", 10)]) }, 3);
    assert.equal(alice.vehiclePropId, "", "map edit removes the stale parked vehicle binding");
    assert.equal(isPositionWalkable(parkedAt, internal.world), true, "removed map vehicle no longer leaves a stale blocker");
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});
