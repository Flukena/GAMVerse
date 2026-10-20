import assert from "node:assert/strict";
import test from "node:test";
import { RealtimeRuntimeMetrics, RUNTIME_SAMPLE_CAPACITY } from "./realtimeRuntimeMetrics.js";

test("runtime samples stay bounded while lifetime counts retain tick and deadline work", () => {
  const metrics = new RealtimeRuntimeMetrics();
  metrics.recordTick(9999);
  for (let index = 0; index < RUNTIME_SAMPLE_CAPACITY; index++) metrics.recordTick(2, 20);
  metrics.recordTick(5, 65);
  metrics.increment("mapApplies");
  metrics.increment("seatCandidates", 7);
  metrics.increment("stationaryTickSkips", 3);
  metrics.recordPatchCycle(1.5);
  metrics.recordOutboundFrame(12, "patch");
  metrics.recordOutboundFrame(20, "snapshot");
  metrics.recordOutboundFrame(5, "other");
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.instrumentationVersion, 2);
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

test("runtime instrumentation handles no samples and idempotent lifecycle", () => {
  const metrics = new RealtimeRuntimeMetrics();
  assert.equal(metrics.snapshot().tick.duration.p99Ms, null);
  assert.equal(metrics.snapshot().eventLoop, null);
  metrics.start(); metrics.start(); metrics.stop(); metrics.stop();
});
