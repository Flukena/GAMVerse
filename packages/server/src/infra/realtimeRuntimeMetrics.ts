import { monitorEventLoopDelay } from "node:perf_hooks";

export const REALTIME_TICK_INTERVAL_MS = 20;
export const RUNTIME_SAMPLE_CAPACITY = 4096;
export const EVENT_LOOP_RESOLUTION_MS = 10;
const EVENT_LOOP_SAMPLE_INTERVAL_MS = 5000;
const NS_PER_MS = 1_000_000;
const PROCESS_STARTED_AT_ISO = new Date(Date.now() - process.uptime() * 1000).toISOString();
type Counter = "mapParses" | "mapApplies" | "vehicleWorldRebuilds" | "vehicleCollisionUpdates" | "seatCandidates" | "proximityPairChecks" | "proximityPossiblePairs" | "stationaryTickSkips";

class BoundedDurations {
  private readonly samples = new Float64Array(RUNTIME_SAMPLE_CAPACITY);
  private next = 0;
  private count = 0;
  add(value: number) {
    this.samples[this.next] = value;
    this.next = (this.next + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
  }
  snapshot() {
    const sorted = Array.from(this.samples.subarray(0, this.count)).sort((a, b) => a - b);
    const percentile = (fraction: number) => sorted.length ? sorted[Math.ceil(fraction * sorted.length) - 1] : null;
    return { sampleCount: this.count, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: sorted.at(-1) ?? null };
  }
}

/** Process-local aggregate diagnostics. Bounded samples contain no room/user IDs. */
export class RealtimeRuntimeMetrics {
  private readonly durations = new BoundedDurations();
  private readonly gaps = new BoundedDurations();
  private readonly patchCycles = new BoundedDurations();
  private ticks = 0;
  private patchCycleCount = 0;
  private estimatedMissedIntervals = 0;
  private readonly outbound = { applicationFrameBytes: 0, frames: 0, statePatchBytes: 0, statePatchFrames: 0, stateSnapshotBytes: 0, stateSnapshotFrames: 0 };
  private readonly counters: Record<Counter, number> = { mapParses: 0, mapApplies: 0, vehicleWorldRebuilds: 0, vehicleCollisionUpdates: 0, seatCandidates: 0, proximityPairChecks: 0, proximityPossiblePairs: 0, stationaryTickSkips: 0 };
  private eventLoop: { p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number; sampleWindowMs: number; resolutionMs: number } | null = null;
  private stopSampling?: () => void;

  increment(counter: Counter, count = 1) { this.counters[counter] += count; }
  recordTick(durationMs: number, startGapMs?: number) {
    this.ticks += 1;
    this.durations.add(Math.max(0, durationMs));
    if (startGapMs !== undefined) {
      this.gaps.add(Math.max(0, startGapMs));
      this.estimatedMissedIntervals += Math.max(0, Math.floor(startGapMs / REALTIME_TICK_INTERVAL_MS) - 1);
    }
  }
  recordPatchCycle(durationMs: number) {
    this.patchCycleCount += 1;
    this.patchCycles.add(Math.max(0, durationMs));
  }
  recordOutboundFrame(byteLength: number, kind: "other" | "patch" | "snapshot") {
    const bytes = Math.max(0, Math.floor(byteLength));
    this.outbound.applicationFrameBytes += bytes;
    this.outbound.frames += 1;
    if (kind === "patch") { this.outbound.statePatchBytes += bytes; this.outbound.statePatchFrames += 1; }
    if (kind === "snapshot") { this.outbound.stateSnapshotBytes += bytes; this.outbound.stateSnapshotFrames += 1; }
  }
  start() {
    if (this.stopSampling) return;
    const histogram = monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS });
    histogram.enable();
    let sampleStartedAtMs = performance.now();
    const timer = setInterval(() => {
      const nowMs = performance.now();
      this.eventLoop = { resolutionMs: EVENT_LOOP_RESOLUTION_MS, p50Ms: histogram.percentile(50) / NS_PER_MS, p95Ms: histogram.percentile(95) / NS_PER_MS, p99Ms: histogram.percentile(99) / NS_PER_MS, maxMs: histogram.max / NS_PER_MS, sampleWindowMs: nowMs - sampleStartedAtMs };
      histogram.reset();
      sampleStartedAtMs = nowMs;
    }, EVENT_LOOP_SAMPLE_INTERVAL_MS);
    timer.unref();
    this.stopSampling = () => { clearInterval(timer); histogram.disable(); };
  }
  stop() { this.stopSampling?.(); this.stopSampling = undefined; }
  snapshot() {
    return {
      instrumentationVersion: 2,
      processStartedAtIso: PROCESS_STARTED_AT_ISO,
      tick: { count: this.ticks, duration: this.durations.snapshot(), startGap: this.gaps.snapshot(), estimatedMissedIntervals: this.estimatedMissedIntervals, expectedIntervalMs: REALTIME_TICK_INTERVAL_MS, sampleCapacity: RUNTIME_SAMPLE_CAPACITY },
      replication: { patchCycleCount: this.patchCycleCount, patchCycleDurationMs: this.patchCycles.snapshot(), ...this.outbound },
      eventLoop: this.eventLoop && { ...this.eventLoop },
      rssBytes: process.memoryUsage().rss,
      cpuUsageMicros: process.cpuUsage(),
      counters: { ...this.counters },
      unavailable: { routeQueueDepth: null, routeSearchDurationMs: null, networkBytes: null },
    };
  }
}

export const realtimeRuntimeMetrics = new RealtimeRuntimeMetrics();
