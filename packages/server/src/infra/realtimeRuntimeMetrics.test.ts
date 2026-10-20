import assert from "node:assert/strict";
import test from "node:test";
import { REALTIME_TICK_INTERVAL_MS, REALTIME_TICK_RATE_HZ, RealtimeRuntimeMetrics, RUNTIME_SAMPLE_CAPACITY } from "./realtimeRuntimeMetrics.js";

test("runtime samples stay bounded while lifetime counts retain tick and deadline work", () => {
  const metrics = new RealtimeRuntimeMetrics();
  metrics.recordTick(9999);
  for (let index = 0; index < RUNTIME_SAMPLE_CAPACITY; index++) metrics.recordTick(2, 50);
  metrics.recordTick(5, 165);
  metrics.increment("mapApplies");
  metrics.increment("seatCandidates", 7);
  metrics.increment("stationaryTickSkips", 3);
  metrics.recordPatchCycle(1.5);
  metrics.recordOutboundFrame(12, "patch");
  metrics.recordOutboundFrame(20, "snapshot");
  metrics.recordOutboundFrame(5, "other");
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.instrumentationVersion, 3);
  assert.equal(snapshot.tick.expectedIntervalMs, 50);
  assert.equal(snapshot.tick.count, RUNTIME_SAMPLE_CAPACITY + 2);
  assert.equal(snapshot.tick.duration.sampleCount, RUNTIME_SAMPLE_CAPACITY);
  assert.equal(snapshot.tick.duration.p50Ms, 2);
  assert.equal(snapshot.tick.duration.maxMs, 5);
  assert.equal(snapshot.tick.estimatedMissedIntervals, 2);
  assert.equal(snapshot.counters.mapApplies, 1);
  assert.equal(snapshot.counters.seatCandidates, 7);
  assert.equal(snapshot.counters.stationaryTickSkips, 3);
  assert.equal(snapshot.replication.patchCycleCount, 1);
  assert.equal(snapshot.replication.patchCycleDurationMs.p95Ms, 1.5);
  assert.equal(snapshot.replication.statePatchBytes, 12);
  assert.equal(snapshot.replication.stateSnapshotBytes, 20);
  assert.equal(snapshot.replication.applicationFrameBytes, 37);
  snapshot.counters.mapApplies = 100;
  assert.equal(metrics.snapshot().counters.mapApplies, 1);
  assert.equal(snapshot.unavailable.networkBytes, null);
  assert.ok(snapshot.rssBytes > 0);
});

test("missed interval estimates use the same 20 Hz cadence as the room", () => {
  assert.equal(REALTIME_TICK_RATE_HZ, 20);
  assert.equal(REALTIME_TICK_INTERVAL_MS, 1000 / REALTIME_TICK_RATE_HZ);
  const metrics = new RealtimeRuntimeMetrics();
  for (const gap of [0, 49, 50, 51, 99]) metrics.recordTick(1, gap);
  assert.equal(metrics.snapshot().tick.estimatedMissedIntervals, 0);
  metrics.recordTick(1, 100);
  assert.equal(metrics.snapshot().tick.estimatedMissedIntervals, 1);
  metrics.recordTick(1, 150);
  assert.equal(metrics.snapshot().tick.estimatedMissedIntervals, 3);
});

test("runtime instrumentation handles no samples and idempotent lifecycle", () => {
  const metrics = new RealtimeRuntimeMetrics();
  assert.equal(metrics.snapshot().tick.duration.p99Ms, null);
  assert.equal(metrics.snapshot().eventLoop, null);
  metrics.start(); metrics.start(); metrics.stop(); metrics.stop();
});
