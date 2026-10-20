import assert from "node:assert/strict";
import test from "node:test";
import { ClientRuntimeMetrics } from "./clientRuntimeMetrics.js";

test("client runtime metrics report bounded frame and snapshot processing samples", () => {
  const metrics = new ClientRuntimeMetrics();
  metrics.recordFrame(8);
  metrics.recordFrame(20);
  metrics.recordStateApply(2, 25);
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.frameCount, 2);
  assert.equal(snapshot.frameDurationMs.p50Ms, 8);
  assert.equal(snapshot.frameDurationMs.p99Ms, 20);
  assert.equal(snapshot.stateApplyCount, 1);
  assert.equal(snapshot.stateApplyDurationMs.maxMs, 2);
  assert.equal(snapshot.latestSnapshotPlayers, 25);
});

test("client runtime sample buffers stay bounded", () => {
  const metrics = new ClientRuntimeMetrics();
  for (let index = 0; index < 600; index += 1) metrics.recordFrame(index);
  assert.equal(metrics.snapshot().frameDurationMs.sampleCount, 512);
  assert.equal(metrics.snapshot().frameDurationMs.p50Ms, 343);
});
