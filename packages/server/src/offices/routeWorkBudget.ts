// All route commands from one session share admission, so alternating message
// types cannot bypass the limit. Dropped commands leave the active route intact.
const ROUTE_REQUEST_MIN_INTERVAL_MS = 500;
const ROUTE_SEARCH_MAX_DURATION_MS = 500;

export class RouteSearchBudget {
  private readonly deadlineMs = performance.now() + ROUTE_SEARCH_MAX_DURATION_MS;

  get exhausted() {
    return performance.now() >= this.deadlineMs;
  }
}

export class RouteWorkLimiter {
  private readonly nextRequestAtBySessionId = new Map<string, number>();

  delayMs(sessionId: string) {
    return Math.max(0, (this.nextRequestAtBySessionId.get(sessionId) ?? 0) - performance.now());
  }

  admit(sessionId: string) {
    const nowMs = performance.now();
    if (this.delayMs(sessionId) > 0) return false;
    this.nextRequestAtBySessionId.set(sessionId, nowMs + ROUTE_REQUEST_MIN_INTERVAL_MS);
    return true;
  }

  forget(sessionId: string) {
    this.nextRequestAtBySessionId.delete(sessionId);
  }
}
