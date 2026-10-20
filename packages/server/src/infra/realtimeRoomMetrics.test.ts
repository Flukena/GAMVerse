import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { PlayerState, ROOM_PROP_CATALOG, type RoomLayout } from "@gammyverse/shared";
import { OfficeRoom } from "../offices/OfficeRoom.js";
import { RoomSeatIndex } from "../offices/roomSeatIndex.js";
import { realtimeRuntimeMetrics } from "./realtimeRuntimeMetrics.js";

test("real room ticks, map applications, seats and proximity populate runtime diagnostics", async () => {
  const room = new OfficeRoom();
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {});
  mock.method(console, "info", () => {});
  const internals = room as unknown as {
    applyMapConfig(config: unknown, version: number): void;
    step(dt: number): void; stepWork(dt: number): void; updateProximity(): void;
    seatIndex: RoomSeatIndex;
  };
  try {
    await room.onCreate({ officeId: "00000000-0000-4000-8000-000000000057" });
    const definition = ROOM_PROP_CATALOG.find(prop => prop.interaction === "sit")!;
    const layout: RoomLayout = { version: 1, walls: [], doors: [], zones: [], props: [{ id: "metrics-chair", asset: definition.asset, x: 0, z: 0, width: 1, depth: 1, rotation: 0, collision: false }] };
    const beforeMap = realtimeRuntimeMetrics.snapshot().counters;
    internals.applyMapConfig({ version: 1, layout }, 2);
    const afterMap = realtimeRuntimeMetrics.snapshot().counters;
    assert.equal(afterMap.mapApplies - beforeMap.mapApplies, 1);
    assert.ok(afterMap.mapParses > beforeMap.mapParses);
    assert.ok(afterMap.vehicleWorldRebuilds > beforeMap.vehicleWorldRebuilds);
    internals.applyMapConfig({ version: 1, layout }, 1);
    assert.equal(realtimeRuntimeMetrics.snapshot().counters.mapApplies, afterMap.mapApplies, "stale maps do not count as applies");
    const beforeSeats = realtimeRuntimeMetrics.snapshot().counters.seatCandidates;
    assert.ok(internals.seatIndex.nearest({ x: 0, z: 0 }, 3, new Set()));
    assert.ok(realtimeRuntimeMetrics.snapshot().counters.seatCandidates > beforeSeats);
    for (const id of ["first", "second"]) {
      const player = new PlayerState(); player.presence = "online"; player.x = 0; player.z = 0;
      room.state.players.set(id, player);
    }
    const beforePairs = realtimeRuntimeMetrics.snapshot().counters.proximityPairChecks;
    internals.updateProximity();
    assert.equal(realtimeRuntimeMetrics.snapshot().counters.proximityPairChecks - beforePairs, 1);
    const beforeTick = realtimeRuntimeMetrics.snapshot().tick.count;
    internals.step(0.02);
    assert.equal(realtimeRuntimeMetrics.snapshot().tick.count, beforeTick + 1);
    assert.ok(realtimeRuntimeMetrics.snapshot().tick.duration.sampleCount > 0);
    mock.method(internals, "stepWork", () => { throw new Error("deliberate diagnostic failure"); });
    assert.throws(() => internals.step(0.02), /deliberate diagnostic failure/);
    assert.equal(realtimeRuntimeMetrics.snapshot().tick.count, beforeTick + 2, "finally records failed steps too");
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});
