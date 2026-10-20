const SAMPLE_CAPACITY = 512;

class Samples {
  private readonly values = new Float64Array(SAMPLE_CAPACITY);
  private count = 0;
  private next = 0;
  add(value: number) {
    this.values[this.next] = Math.max(0, value);
    this.next = (this.next + 1) % this.values.length;
    this.count = Math.min(this.count + 1, this.values.length);
  }
  snapshot() {
    const sorted = Array.from(this.values.subarray(0, this.count)).sort((a, b) => a - b);
    const percentile = (fraction: number) => sorted.length ? sorted[Math.ceil(fraction * sorted.length) - 1] : null;
    return { sampleCount: this.count, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: sorted.at(-1) ?? null };
  }
}

export class ClientRuntimeMetrics {
  private readonly frames = new Samples();
  private readonly stateApplies = new Samples();
  private frameCount = 0;
  private stateApplyCount = 0;
  private latestSnapshotPlayers = 0;
  recordFrame(durationMs: number) { this.frameCount += 1; this.frames.add(durationMs); }
  recordStateApply(durationMs: number, playerCount: number) {
    this.stateApplyCount += 1;
    this.latestSnapshotPlayers = playerCount;
    this.stateApplies.add(durationMs);
  }
  snapshot() {
    return {
      frameCount: this.frameCount,
      frameDurationMs: this.frames.snapshot(),
      stateApplyCount: this.stateApplyCount,
      stateApplyDurationMs: this.stateApplies.snapshot(),
      latestSnapshotPlayers: this.latestSnapshotPlayers,
    };
  }
}

export const clientRuntimeMetrics = new ClientRuntimeMetrics();

declare global {
  interface Window { __gammyverseRuntimeMetrics?: () => ReturnType<ClientRuntimeMetrics["snapshot"]> }
}

if (import.meta.env?.DEV && typeof window !== "undefined") {
  window.__gammyverseRuntimeMetrics = () => clientRuntimeMetrics.snapshot();
}
