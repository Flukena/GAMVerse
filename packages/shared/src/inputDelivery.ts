export const INPUT_MIN_INTERVAL_MS = 30;
export const INPUT_HEARTBEAT_INTERVAL_MS = 50;
export const RECONNECTION_SEAT_TIMEOUT_SECONDS = 20;

export interface MovementInput {
  x: number;
  z: number;
  sprint?: boolean;
  facingYaw?: number;
}

/** Keeps only the latest intent; callers retry it on the next heartbeat. */
export class InputSendGate {
  private lastSentInput: MovementInput | null = null;
  private lastSentAtMs = Number.NEGATIVE_INFINITY;

  take(input: MovementInput, nowMs: number): MovementInput | null {
    const elapsedMs = nowMs - this.lastSentAtMs;
    if (elapsedMs < INPUT_MIN_INTERVAL_MS) return null;
    const changed = !this.lastSentInput || input.x !== this.lastSentInput.x
      || input.z !== this.lastSentInput.z || Boolean(input.sprint) !== Boolean(this.lastSentInput.sprint)
      || input.facingYaw !== this.lastSentInput.facingYaw;
    if (!changed && elapsedMs < INPUT_HEARTBEAT_INTERVAL_MS) return null;
    this.lastSentInput = { ...input };
    this.lastSentAtMs = nowMs;
    return input;
  }
}
