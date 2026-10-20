import { monitorEventLoopDelay } from "node:perf_hooks";
import { DIAGNOSTIC_COOLDOWN_MS, DIAGNOSTIC_RETENTION_DAYS, type DiagnosticItem, type DiagnosticPage } from "@gammyverse/shared";
import { database } from "./db.js";
import type { PoolClient } from "pg";
import { observeServerErrors } from "./logger.js";

const SAMPLE_INTERVAL_MS = 5_000;
const CPU_PEAK_PERCENT_ONE_CORE = 80;
const EVENT_LOOP_PEAK_MS = 250;
const MAX_QUEUED_EVENTS = 200;
type Pending = Omit<DiagnosticItem, "id" | "occurredAt"> & { occurredAt: string };

export class DiagnosticRateLimit {
  private readonly entries = new Map<string, { start: number; count: number }>();
  constructor(private readonly maxKeys = 5_000) {}
  allow(key: string, limit: number, now = Date.now()): boolean {
    for (const [id, entry] of this.entries) {
      if (now - entry.start >= DIAGNOSTIC_COOLDOWN_MS) this.entries.delete(id);
      else break;
    }
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= this.maxKeys) return false;
      entry = { start: now, count: 0 };
      this.entries.set(key, entry);
    }
    if (entry.count >= limit) return false;
    entry.count++;
    return true;
  }
}

export async function insertDiagnostics(events: readonly Pending[], queryable: Pick<PoolClient, "query"> | null = database): Promise<void> {
  if (!queryable) throw new Error("Diagnostics require PostgreSQL.");
  await queryable.query(
    `INSERT INTO app_runtime_diagnostics(occurred_at, source, code, office_id, metrics)
     SELECT occurred_at, source, code, office_id, metrics
     FROM jsonb_to_recordset($1::jsonb)
       AS event(occurred_at timestamptz, source text, code text, office_id uuid, metrics jsonb)`,
    [JSON.stringify(events.map(event => ({
      occurred_at: event.occurredAt, source: event.source, code: event.code,
      office_id: event.officeId, metrics: event.metrics,
    })))],
  );
}

export async function listDiagnostics(cursor?: string, queryable: Pick<PoolClient, "query"> | null = database): Promise<DiagnosticPage> {
  if (!queryable) throw new Error("Diagnostics require PostgreSQL.");
  const result = await queryable.query<{
    id: string; occurred_at: Date; source: DiagnosticItem["source"]; code: DiagnosticItem["code"];
    office_id: string | null; metrics: DiagnosticItem["metrics"];
  }>(`SELECT id::text, occurred_at, source, code, office_id, metrics
      FROM app_runtime_diagnostics
      WHERE occurred_at >= now() - ($2::integer * interval '1 day') AND ($1::bigint IS NULL OR id < $1::bigint)
      ORDER BY app_runtime_diagnostics.id DESC LIMIT 51`, [cursor ?? null, DIAGNOSTIC_RETENTION_DAYS]);
  const rows = result.rows.slice(0, 50);
  return {
    items: rows.map(row => ({
      id: row.id, occurredAt: row.occurred_at.toISOString(), source: row.source,
      code: row.code, officeId: row.office_id, metrics: row.metrics,
    })),
    nextCursor: result.rows.length > 50 ? rows.at(-1)!.id : null,
  };
}

export async function pruneDiagnostics(queryable: Pick<PoolClient, "query"> | null = database): Promise<void> {
  if (!queryable) throw new Error("Diagnostics require PostgreSQL.");
  await queryable.query("DELETE FROM app_runtime_diagnostics WHERE occurred_at < now() - ($1::integer * interval '1 day')", [DIAGNOSTIC_RETENTION_DAYS]);
}

export function processPressure(cpuDeltaMicros: number, elapsedMs: number, loopMaxMs: number) {
  const cpuPercent = cpuDeltaMicros / 1000 / elapsedMs * 100;
  const loopMs = Math.max(loopMaxMs, elapsedMs - SAMPLE_INTERVAL_MS);
  return {
    cpuPercent, loopMs,
    cpuPeak: cpuPercent >= CPU_PEAK_PERCENT_ONE_CORE,
    loopStall: loopMs >= EVENT_LOOP_PEAK_MS,
  };
}

export function startDiagnostics(service: "api" | "realtime"): () => void {
  if (!database) {
    console.warn("Persistent diagnostics disabled: PostgreSQL is not configured.");
    return () => {};
  }
  const queue: Pending[] = [];
  const gate = new DiagnosticRateLimit();
  let flushing = false;
  let lastPruneAt = 0;
  let previousCpu = process.cpuUsage();
  let previousTime = performance.now();
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  const enqueue = (code: Pending["code"], metrics: Pending["metrics"]) => {
    if (!gate.allow(code, 1)) return;
    if (queue.length >= MAX_QUEUED_EVENTS) {
      console.warn("Diagnostics queue full; event dropped.");
      return;
    }
    queue.push({ occurredAt: new Date().toISOString(), source: service, code, officeId: null, metrics });
  };
  const stopObserving = observeServerErrors(source => {
    if (source === service) enqueue("server_error", {});
  });
  const flush = async () => {
    if (flushing) return;
    flushing = true;
    const batch = queue.splice(0, 40);
    try {
      if (batch.length) await insertDiagnostics(batch);
      if (service === "api" && Date.now() - lastPruneAt >= 60 * 60_000) {
        await pruneDiagnostics();
        lastPruneAt = Date.now();
      }
    } catch {
      // Do not call logServerError here: that would feed failures back into this queue.
      console.warn(`Diagnostics persistence failed; ${batch.length} events were not stored.`);
    } finally { flushing = false; }
  };
  const onFatal = () => { enqueue("server_error", {}); void flush(); };
  process.on("uncaughtExceptionMonitor", onFatal);
  const timer = setInterval(() => {
    const now = performance.now();
    const cpu = process.cpuUsage();
    const elapsedMs = now - previousTime;
    const pressure = processPressure(cpu.user + cpu.system - previousCpu.user - previousCpu.system, elapsedMs, histogram.max / 1_000_000);
    previousCpu = cpu;
    previousTime = now;
    histogram.reset();
    if (pressure.cpuPeak) enqueue("cpu_peak", { cpuPercent: pressure.cpuPercent, durationMs: elapsedMs });
    if (pressure.loopStall) enqueue("event_loop_stall", { durationMs: pressure.loopMs });
    void flush();
  }, SAMPLE_INTERVAL_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
    histogram.disable();
    stopObserving();
    process.removeListener("uncaughtExceptionMonitor", onFatal);
    void flush();
  };
}
