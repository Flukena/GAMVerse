import { Worker } from "node:worker_threads";
import type { RouteSearchSnapshot, RouteSearchRequest, RouteSearchAdmission, RouteSearchResult, RouteWorkerResponse } from "./routeSearchProtocol.js";
import { resolveRouteSearchWorkerPath } from "./routeSearchWorkerPath.js";

type WorkerLike = {
  postMessage(message: unknown): void;
  terminate(): Promise<number> | number;
  on(event: "message", listener: (message: RouteWorkerResponse) => void): WorkerLike;
  on(event: "error", listener: (error: Error) => void): WorkerLike;
  on(event: "exit", listener: (code: number) => void): WorkerLike;
};
type PendingJob = { jobId: string; request: RouteSearchRequest; resolve: (result: RouteSearchResult | null) => void; timer?: ReturnType<typeof setTimeout>; settled?: boolean; finished?: boolean };
type Slot = { worker?: WorkerLike; active?: PendingJob; snapshots: Set<string>; generation: number };
type ResolvedOptions = Required<Omit<RouteSearchPoolOptions, "workerFactory">> & Pick<RouteSearchPoolOptions, "workerFactory">;
export type RouteSearchPoolOptions = {
  workerCount?: number;
  globalQueueLimit?: number;
  roomQueueLimit?: number;
  sessionQueueLimit?: number;
  workerTimeoutMs?: number;
  snapshotLimit?: number;
  workerFactory?: () => WorkerLike;
};

const DEFAULTS = { workerCount: 2, globalQueueLimit: 128, roomQueueLimit: 32, sessionQueueLimit: 1, workerTimeoutMs: 2_000, snapshotLimit: 64 } as const;
const HARD_CAPS = { workerCount: 4, globalQueueLimit: 512, roomQueueLimit: 64, sessionQueueLimit: 4, workerTimeoutMs: 30_000, snapshotLimit: 256 } as const;
const PRIORITY_CYCLE = ["interactive", "interactive", "follow", "interactive", "seat"] as const;
const workerSnapshotLimit = 8;

/**
 * Bounded process-local route worker pool. `cancel()` removes queued work only;
 * already-running synchronous A* work is allowed to finish and its result is
 * discarded. The hard worker timeout terminates/replaces a stuck worker.
 */
export class RouteSearchPool {
  private readonly options: ResolvedOptions;
  private readonly slots: Slot[] = [];
  private readonly snapshots = new Map<string, RouteSearchSnapshot>();
  private readonly queues = new Map<RouteSearchRequest["priority"], Map<string, PendingJob[]>>();
  private readonly roomCounts = new Map<string, number>();
  private readonly sessionCounts = new Map<string, number>();
  private readonly sessionOutstanding = new Map<string, number>();
  private queuedCount = 0;
  private nextJobSequence = 0;
  private priorityCursor = 0;
  private disposed = false;

  constructor(options: RouteSearchPoolOptions = {}) {
    const clamp = (value: number | undefined, fallback: number, maximum: number, minimum = 1) => Math.min(maximum, Math.max(minimum, Math.floor(Number.isFinite(value) ? value! : fallback)));
    this.options = {
      workerCount: clamp(options.workerCount, DEFAULTS.workerCount, HARD_CAPS.workerCount),
      globalQueueLimit: clamp(options.globalQueueLimit, DEFAULTS.globalQueueLimit, HARD_CAPS.globalQueueLimit),
      roomQueueLimit: clamp(options.roomQueueLimit, DEFAULTS.roomQueueLimit, HARD_CAPS.roomQueueLimit),
      sessionQueueLimit: clamp(options.sessionQueueLimit, DEFAULTS.sessionQueueLimit, HARD_CAPS.sessionQueueLimit),
      workerTimeoutMs: clamp(options.workerTimeoutMs, DEFAULTS.workerTimeoutMs, HARD_CAPS.workerTimeoutMs, 50),
      snapshotLimit: clamp(options.snapshotLimit, DEFAULTS.snapshotLimit, HARD_CAPS.snapshotLimit),
      workerFactory: options.workerFactory,
    };
    for (let index = 0; index < this.options.workerCount; index += 1) this.slots.push({ snapshots: new Set(), generation: 0 });
    for (const priority of ["interactive", "follow", "seat"] as const) this.queues.set(priority, new Map());
    for (const slot of this.slots) this.spawn(slot);
  }

  /** Install/update immutable room geometry; revisions are monotonically owned by caller. */
  setSnapshot(snapshot: RouteSearchSnapshot) {
    if (this.disposed) return false;
    const key = snapshot.roomId;
    const existing = this.snapshots.get(key);
    if (existing && existing.revision > snapshot.revision) return false;
    if (existing && existing.revision !== snapshot.revision) this.invalidateRoom(key);
    this.snapshots.delete(key);
    const { dynamicCollisionGrid: _dynamic, excludedVehiclePropId: _excluded, accessOverlay: _access, ...staticWorld } = snapshot.world;
    this.snapshots.set(key, structuredClone({ ...snapshot, world: staticWorld }));
    while (this.snapshots.size > this.options.snapshotLimit) {
      const oldestRoomId = this.snapshots.keys().next().value as string | undefined;
      if (!oldestRoomId) break;
      this.snapshots.delete(oldestRoomId);
      this.invalidateRoom(oldestRoomId);
    }
    return true;
  }

  submit(request: RouteSearchRequest): { admission: RouteSearchAdmission; result: Promise<RouteSearchResult | null> } {
    if (this.disposed) return { admission: { status: "busy", requestId: request.requestId, reason: "disposed" }, result: Promise.resolve(null) };
    if (this.snapshots.get(request.roomId)?.revision !== request.revision) return { admission: { status: "busy", requestId: request.requestId, reason: "stale-snapshot" }, result: Promise.resolve(null) };
    if (this.queuedCount >= this.options.globalQueueLimit) return { admission: { status: "busy", requestId: request.requestId, reason: "global-cap" }, result: Promise.resolve(null) };
    const roomCount = this.roomCounts.get(request.roomId) ?? 0;
    if (roomCount >= this.options.roomQueueLimit) return { admission: { status: "busy", requestId: request.requestId, reason: "room-cap" }, result: Promise.resolve(null) };
    const sessionKey = `${request.roomId}\u0000${request.sessionId}`;
    if ((this.sessionOutstanding.get(sessionKey) ?? 0) >= this.options.sessionQueueLimit) return { admission: { status: "busy", requestId: request.requestId, reason: "session-cap" }, result: Promise.resolve(null) };
    let resolve!: (result: RouteSearchResult | null) => void;
    const result = new Promise<RouteSearchResult | null>((done) => { resolve = done; });
    const job: PendingJob = { jobId: `route-job-${++this.nextJobSequence}`, request: { ...request, start: { ...request.start }, destination: { ...request.destination } }, resolve };
    const roomQueues = this.queues.get(request.priority)!;
    const queue = roomQueues.get(request.roomId) ?? [];
    queue.push(job); roomQueues.set(request.roomId, queue);
    this.queuedCount += 1;
    this.roomCounts.set(request.roomId, roomCount + 1);
    this.sessionCounts.set(sessionKey, (this.sessionCounts.get(sessionKey) ?? 0) + 1);
    this.sessionOutstanding.set(sessionKey, (this.sessionOutstanding.get(sessionKey) ?? 0) + 1);
    this.dispatch();
    return { admission: { status: "queued", requestId: request.requestId, jobId: job.jobId }, result };
  }

  /** Cancels/removes queued work by this pool's unique job handle. Active work cannot be interrupted. */
  cancel(jobId: string): boolean {
    for (const queues of this.queues.values()) for (const [roomId, queue] of queues) {
      const index = queue.findIndex((job) => job.jobId === jobId);
      if (index < 0) continue;
      const [job] = queue.splice(index, 1);
      if (!queue.length) queues.delete(roomId);
      this.dequeued(job!); this.finish(job!); job!.settled = true; job!.resolve(null);
      return true;
    }
    return false;
  }

  cancelSession(roomId: string, sessionId: string) {
    const jobs: PendingJob[] = [];
    for (const queues of this.queues.values()) for (const queue of queues.values()) for (const job of queue) {
      if (job.request.roomId === roomId && job.request.sessionId === sessionId) jobs.push(job);
    }
    jobs.forEach((job) => this.cancel(job.jobId));
    return jobs.length;
  }

  cancelRoom(roomId: string) {
    const jobs: PendingJob[] = [];
    for (const queues of this.queues.values()) for (const queue of queues.values()) for (const job of queue) if (job.request.roomId === roomId) jobs.push(job);
    jobs.forEach((job) => this.cancel(job.jobId));
    return jobs.length;
  }

  removeSnapshot(roomId: string) {
    const removed = this.snapshots.delete(roomId);
    this.invalidateRoom(roomId);
    return removed;
  }

  get pendingCount() { return this.queuedCount; }
  get activeCount() { return this.slots.filter((slot) => slot.active).length; }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const queues of this.queues.values()) for (const queue of queues.values()) for (const job of queue) { job.settled = true; job.resolve(null); }
    for (const queues of this.queues.values()) for (const queue of queues.values()) for (const job of queue) this.finish(job);
    this.queues.forEach((queues) => queues.clear()); this.queuedCount = 0; this.roomCounts.clear(); this.sessionCounts.clear();
    await Promise.all(this.slots.map(async (slot) => { if (slot.active) { clearTimeout(slot.active.timer); this.finish(slot.active); if (!slot.active.settled) { slot.active.settled = true; slot.active.resolve(null); } slot.active = undefined; } await slot.worker?.terminate(); slot.worker = undefined; }));
    this.snapshots.clear();
  }

  private spawn(slot: Slot) {
    if (this.disposed) return;
    const generation = ++slot.generation;
    let worker: WorkerLike;
    try { worker = this.options.workerFactory?.() ?? createNodeWorker(); }
    catch {
      const retry = setTimeout(() => { if (!this.disposed && slot.generation === generation) this.spawn(slot); }, 100);
      retry.unref?.();
      return;
    }
    slot.worker = worker; slot.snapshots.clear();
    worker.on("message", (message) => {
      if (slot.generation !== generation || slot.worker !== worker) return;
      if (message.type === "snapshot-ready") { slot.snapshots.add(`${message.roomId}:${message.revision}`); return; }
      if (message.type === "result" || message.type === "error") {
        const active = slot.active;
        if (!active || message.requestId !== active.request.requestId) return;
        clearTimeout(active.timer); slot.active = undefined;
        const currentRevision = this.snapshots.get(active.request.roomId)?.revision;
        this.finish(active);
        if (!active.settled) { active.settled = true; active.resolve(message.type === "result" && currentRevision === active.request.revision ? message.result : null); }
        this.dispatch();
      }
    });
    worker.on("error", () => this.replace(slot, generation));
    worker.on("exit", () => { if (slot.generation === generation) this.replace(slot, generation); });
    this.dispatch();
  }

  private replace(slot: Slot, generation: number) {
    if (this.disposed || slot.generation !== generation) return;
    const active = slot.active;
    if (active) { clearTimeout(active.timer); slot.active = undefined; this.finish(active); if (!active.settled) { active.settled = true; active.resolve(null); } }
    const worker = slot.worker; slot.worker = undefined; slot.generation += 1;
    void worker?.terminate();
    this.spawn(slot);
  }

  private dispatch() {
    if (this.disposed) return;
    for (const slot of this.slots) {
      if (!slot.worker || slot.active) continue;
      const job = this.nextJob();
      if (!job) return;
      this.dequeued(job);
      const snapshot = this.snapshots.get(job.request.roomId);
      if (!snapshot || snapshot.revision !== job.request.revision) { this.finish(job); job.settled = true; job.resolve(null); continue; }
      const snapshotKey = `${snapshot.roomId}:${snapshot.revision}`;
      if (!slot.snapshots.has(snapshotKey)) {
        slot.worker.postMessage({ type: "snapshot", snapshot });
        slot.snapshots.add(snapshotKey);
        while (slot.snapshots.size > workerSnapshotLimit) slot.snapshots.delete(slot.snapshots.values().next().value!);
      }
      slot.active = job;
      job.timer = setTimeout(() => this.replace(slot, slot.generation), this.options.workerTimeoutMs);
      slot.worker.postMessage({ type: "search", request: job.request });
    }
  }

  private nextJob() {
    for (let attempts = 0; attempts < PRIORITY_CYCLE.length; attempts += 1) {
      const priority = PRIORITY_CYCLE[this.priorityCursor++ % PRIORITY_CYCLE.length]!;
      const queues = this.queues.get(priority)!;
      const roomId = queues.keys().next().value as string | undefined;
      if (!roomId) continue;
      const queue = queues.get(roomId)!;
      const job = queue.shift();
      if (!queue.length) queues.delete(roomId);
      else { queues.delete(roomId); queues.set(roomId, queue); }
      if (job) return job;
    }
    // Priorities with no turn in this cycle still progress; room order remains round-robin.
    for (const queues of this.queues.values()) for (const [roomId, queue] of queues) {
      const job = queue.shift(); if (!queue.length) queues.delete(roomId); else { queues.delete(roomId); queues.set(roomId, queue); }
      if (job) return job;
    }
    return undefined;
  }

  private dequeued(job: PendingJob) {
    this.queuedCount -= 1;
    const roomCount = this.roomCounts.get(job.request.roomId) ?? 0;
    if (roomCount <= 1) this.roomCounts.delete(job.request.roomId); else this.roomCounts.set(job.request.roomId, roomCount - 1);
    const key = `${job.request.roomId}\u0000${job.request.sessionId}`;
    const sessionCount = this.sessionCounts.get(key) ?? 0;
    if (sessionCount <= 1) this.sessionCounts.delete(key); else this.sessionCounts.set(key, sessionCount - 1);
  }

  private finish(job: PendingJob) {
    if (job.finished) return;
    job.finished = true;
    const key = `${job.request.roomId}\u0000${job.request.sessionId}`;
    const count = this.sessionOutstanding.get(key) ?? 0;
    if (count <= 1) this.sessionOutstanding.delete(key); else this.sessionOutstanding.set(key, count - 1);
  }

  private invalidateRoom(roomId: string) {
    this.cancelRoom(roomId);
    for (const slot of this.slots) {
      const active = slot.active;
      if (active?.request.roomId !== roomId) continue;
      this.finish(active);
      if (!active.settled) { active.settled = true; active.resolve(null); }
    }
  }
}

function createNodeWorker(): WorkerLike {
  const workerPath = resolveRouteSearchWorkerPath(import.meta.url);
  const isTypeScript = workerPath.endsWith(".ts");
  return new Worker(workerPath, isTypeScript ? { execArgv: ["--import", "tsx"] } : {}) as unknown as WorkerLike;
}
