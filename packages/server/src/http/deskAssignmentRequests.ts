export const DESK_ASSIGNMENT_REQUEST_INTERVAL_MS = 1000;
const MAX_PENDING_DESK_ASSIGNMENT_REQUESTS_COUNT = 32;
const MAX_RECENT_DESK_ASSIGNMENT_REQUESTS_COUNT = 1000;

/** Reject before opening a DB connection; releases never erase the brief rate window. */
export class DeskAssignmentRequests {
  private readonly pending = new Set<string>();
  private readonly lastAt = new Map<string, number>();
  constructor(private readonly nowMs: () => number = Date.now) {}
  acquire(key: string): boolean {
    const nowMs = this.nowMs();
    for (const [id, atMs] of this.lastAt) if (nowMs - atMs >= DESK_ASSIGNMENT_REQUEST_INTERVAL_MS) this.lastAt.delete(id);
    if (this.pending.has(key) || this.pending.size >= MAX_PENDING_DESK_ASSIGNMENT_REQUESTS_COUNT
      || this.lastAt.has(key) || this.lastAt.size >= MAX_RECENT_DESK_ASSIGNMENT_REQUESTS_COUNT) return false;
    this.pending.add(key);
    this.lastAt.set(key, nowMs);
    return true;
  }
  release(key: string) { this.pending.delete(key); }
}
