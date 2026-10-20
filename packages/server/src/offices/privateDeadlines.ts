const TIMER_MAX_DELAY_MS = 2_147_483_647;

/** One unref'd deadline per room; replacing a map or disposing cancels stale work. */
export class PrivateDeadlines {
  private timer?: ReturnType<typeof setTimeout>;
  private deadlineAtMs: number | null = null;
  constructor(private readonly nowMs: () => number, private readonly fire: () => void) {}
  schedule(deadlineAtMs: number | null) {
    if (deadlineAtMs === this.deadlineAtMs) return;
    this.clear();
    this.deadlineAtMs = deadlineAtMs;
    if (deadlineAtMs === null) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.deadlineAtMs = null;
      this.fire();
    }, Math.min(TIMER_MAX_DELAY_MS, Math.max(0, deadlineAtMs - this.nowMs())));
    this.timer.unref?.();
  }
  clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.deadlineAtMs = null;
  }
}
