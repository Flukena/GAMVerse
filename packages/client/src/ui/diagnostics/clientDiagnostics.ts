import { DIAGNOSTIC_COOLDOWN_MS, type ClientDiagnostic, type ClientDiagnosticCode, type DiagnosticMetrics } from "@gammyverse/shared";

export const FRAME_STALL_MS = 250;
export const SLOW_FRAME_AVERAGE_MS = 50;
export const FRAME_WINDOW_MS = 5_000;
const MAX_PENDING_EVENTS = 20;
const MAX_EVENT_AGE_MS = 120_000;
const FLUSH_INTERVAL_MS = 5_000;
const UPLOAD_TIMEOUT_MS = 8_000;
let reportActive: ((code: ClientDiagnosticCode, metrics: DiagnosticMetrics) => void) | null = null;

export function reportClientDiagnostic(code: ClientDiagnosticCode, metrics: DiagnosticMetrics = {}): void {
  reportActive?.(code, metrics);
}

export class ClientDiagnosticBuffer {
  private readonly last = new Map<ClientDiagnosticCode, number>();
  private readonly queue: { event: ClientDiagnostic; queuedAt: number; attempts: number }[] = [];
  dropped = 0;
  push(event: ClientDiagnostic, now: number): boolean {
    const previous = this.last.get(event.code);
    if (previous !== undefined && now - previous < DIAGNOSTIC_COOLDOWN_MS) return false;
    if (this.queue.length >= MAX_PENDING_EVENTS) { this.dropped++; return false; }
    this.last.set(event.code, now);
    this.queue.push({ event, queuedAt: now, attempts: 0 });
    return true;
  }
  peek(now: number) {
    while (this.queue.length && now - this.queue[0]!.queuedAt > MAX_EVENT_AGE_MS) {
      this.queue.shift();
      this.dropped++;
    }
    return this.queue[0];
  }
  finish(success: boolean) {
    const first = this.queue[0];
    if (!first) return;
    first.attempts++;
    if (success || first.attempts >= 3) {
      this.queue.shift();
      if (!success) this.dropped++;
    }
  }
}

export function installClientDiagnostics(endpoint: string, getOfficeId: () => string | null): () => void {
  const buffer = new ClientDiagnosticBuffer();
  const abort = new AbortController();
  let stopped = false;
  let inFlight = false;
  let nextUploadAt = 0;
  let previousFrame: number | null = null;
  let windowStarted = performance.now();
  let frameCount = 0;
  let frameTotalMs = 0;
  let animationFrame = 0;
  const report = (code: ClientDiagnosticCode, metrics: DiagnosticMetrics) => {
    const droppedBefore = buffer.dropped;
    buffer.push({ code, metrics, officeId: getOfficeId() }, performance.now());
    if (buffer.dropped > droppedBefore) console.warn("Diagnostics buffer full; event not queued.");
  };
  reportActive = report;
  const frame = (now: number) => {
    if (document.visibilityState === "visible" && previousFrame !== null) {
      const gap = now - previousFrame;
      if (gap >= FRAME_STALL_MS) report("frame_stall", { durationMs: Math.min(gap, 3_600_000) });
      frameCount++;
      frameTotalMs += gap;
      if (now - windowStarted >= FRAME_WINDOW_MS) {
        const average = frameTotalMs / frameCount;
        if (average >= SLOW_FRAME_AVERAGE_MS) report("slow_frames", { durationMs: average, count: frameCount });
        windowStarted = now;
        frameCount = 0;
        frameTotalMs = 0;
      }
    }
    previousFrame = document.visibilityState === "visible" ? now : null;
    animationFrame = requestAnimationFrame(frame);
  };
  const resetFrames = () => {
    previousFrame = null;
    windowStarted = performance.now();
    frameCount = 0;
    frameTotalMs = 0;
  };
  const onError = () => report("browser_error", {});
  const onRejection = () => report("unhandled_rejection", {});
  const originalConsoleError = console.error;
  const consoleError = (...args: unknown[]) => {
    originalConsoleError.apply(console, args);
    report("browser_error", {});
  };
  console.error = consoleError;
  document.addEventListener("visibilitychange", resetFrames);
  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);
  const observer = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("longtask")
    ? new PerformanceObserver(list => {
      if (document.visibilityState !== "visible") return;
      const entries = list.getEntries().filter(entry => entry.duration >= FRAME_STALL_MS);
      if (entries.length) report("long_task", { durationMs: Math.min(Math.max(...entries.map(entry => entry.duration)), 3_600_000), count: entries.length });
    }) : null;
  observer?.observe({ type: "longtask" });
  animationFrame = requestAnimationFrame(frame);
  const timer = window.setInterval(async () => {
    if (stopped || inFlight || !navigator.onLine || performance.now() < nextUploadAt) return;
    const pending = buffer.peek(performance.now());
    if (!pending) return;
    inFlight = true;
    try {
      const response = await fetch(`${endpoint}/auth/diagnostics`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending.event),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(UPLOAD_TIMEOUT_MS)]),
      });
      if (response.ok) buffer.finish(true);
      else {
        console.warn(`Diagnostic upload failed (HTTP ${response.status}).`);
        buffer.finish(false);
        nextUploadAt = performance.now() + DIAGNOSTIC_COOLDOWN_MS;
      }
    } catch {
      if (!stopped) {
        console.warn("Diagnostic upload unavailable; retry is bounded.");
        buffer.finish(false);
        nextUploadAt = performance.now() + DIAGNOSTIC_COOLDOWN_MS;
      }
    } finally { inFlight = false; }
  }, FLUSH_INTERVAL_MS);
  return () => {
    stopped = true;
    abort.abort();
    if (reportActive === report) reportActive = null;
    if (console.error === consoleError) console.error = originalConsoleError;
    cancelAnimationFrame(animationFrame);
    window.clearInterval(timer);
    observer?.disconnect();
    document.removeEventListener("visibilitychange", resetFrames);
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
