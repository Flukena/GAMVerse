const FOOTSTEP_STRIDE_DISTANCE_M = 0.75;
const FOOTSTEP_MIN_INTERVAL_MS = 380;
const FOOTSTEP_IDLE_RESET_MS = 350;
const FOOTSTEP_FRAME_GAP_RESET_MS = 500;
const FOOTSTEP_TELEPORT_DISTANCE_M = 2;
const FOOTSTEP_POSITION_EPSILON_M = 0.001;

/** Distance comes from authoritative positions, so blocked movement stays silent. */
export class FootstepCadence {
  private previousX = 0;
  private previousZ = 0;
  private previousAtMs: number | null = null;
  private lastMovementAtMs = 0;
  private lastStepAtMs = Number.NEGATIVE_INFINITY;
  private distanceM = 0;

  reset() {
    this.previousAtMs = null;
    this.distanceM = 0;
    this.lastStepAtMs = Number.NEGATIVE_INFINITY;
  }

  advance(x: number, z: number, nowMs: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(nowMs)) {
      this.reset();
      return false;
    }
    const distanceM = Math.hypot(x - this.previousX, z - this.previousZ);
    const elapsedMs = this.previousAtMs === null ? Number.POSITIVE_INFINITY : nowMs - this.previousAtMs;
    this.previousX = x;
    this.previousZ = z;
    this.previousAtMs = nowMs;
    if (elapsedMs < 0 || elapsedMs > FOOTSTEP_FRAME_GAP_RESET_MS || distanceM > FOOTSTEP_TELEPORT_DISTANCE_M) {
      this.distanceM = 0;
      this.lastMovementAtMs = nowMs;
      this.lastStepAtMs = Number.NEGATIVE_INFINITY;
      return false;
    }
    if (nowMs - this.lastMovementAtMs > FOOTSTEP_IDLE_RESET_MS) this.distanceM = 0;
    if (distanceM < FOOTSTEP_POSITION_EPSILON_M) return false;
    this.lastMovementAtMs = nowMs;
    this.distanceM += distanceM;
    if (this.distanceM < FOOTSTEP_STRIDE_DISTANCE_M || nowMs - this.lastStepAtMs < FOOTSTEP_MIN_INTERVAL_MS) return false;
    this.distanceM = 0;
    this.lastStepAtMs = nowMs;
    return true;
  }
}
