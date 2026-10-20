import assert from "node:assert/strict";
import test from "node:test";
import { database, closeDatabase } from "./db.js";
import { insertDiagnostics, listDiagnostics, pruneDiagnostics, processPressure } from "./diagnostics.js";
import { logServerError, observeServerErrors } from "./logger.js";

test("server pressure uses one-core CPU and exact five-second thresholds", () => {
  assert.equal(processPressure(3_999_999, 5_000, 249).cpuPeak, false);
  assert.equal(processPressure(4_000_000, 5_000, 249).cpuPeak, true);
  assert.equal(processPressure(10_000_000, 5_000, 0).cpuPercent, 200);
  assert.equal(processPressure(0, 5_000, 249).loopStall, false);
  assert.equal(processPressure(0, 5_000, 250).loopStall, true);
  assert.equal(processPressure(0, 5_250, 0).loopStall, true);
});

test("structured server errors notify only the service, never error text or fields", t => {
  const original = console.error;
  console.error = () => {};
  t.after(() => { console.error = original; });
  const observed: string[] = [];
  const stop = observeServerErrors(service => observed.push(service));
  try {
    logServerError("api", "private.event", new Error("private error"), { private: "secret" });
    assert.deepEqual(observed, ["api"]);
  } finally { stop(); }
  logServerError("realtime", "private.event", new Error("private"));
  assert.deepEqual(observed, ["api"]);
});

test("diagnostics persist technical events, paginate and prune seven-day retention in a rolled-back transaction", {
  skip: !database && "PostgreSQL is not configured",
}, async () => {
  const client = await database!.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const recent = Array.from({ length: 52 }, (_, index) => ({
      occurredAt: new Date().toISOString(), source: "api" as const,
      code: "cpu_peak" as const, officeId: null, metrics: { cpuPercent: 80 + index },
    }));
    await insertDiagnostics(recent, client);
    await insertDiagnostics([{ ...recent[0]!, occurredAt: new Date(Date.now() - 8 * 86_400_000).toISOString() }], client);
    const first = await listDiagnostics(undefined, client);
    assert.equal(first.items.length, 50);
    assert.ok(first.nextCursor);
    const next = await listDiagnostics(first.nextCursor!, client);
    assert.ok(next.items.length >= 2);
    assert.ok(next.items.every(item => BigInt(item.id) < BigInt(first.nextCursor!)));
    assert.equal(first.items[0]!.source, "api");
    assert.deepEqual(first.items[0]!.metrics, { cpuPercent: 131 });
    const staleBefore = await client.query("SELECT count(*)::integer AS count FROM app_runtime_diagnostics WHERE occurred_at < now() - interval '7 days'");
    assert.ok(staleBefore.rows[0].count >= 1);
    await pruneDiagnostics(client);
    const staleAfter = await client.query("SELECT count(*)::integer AS count FROM app_runtime_diagnostics WHERE occurred_at < now() - interval '7 days'");
    assert.equal(staleAfter.rows[0].count, 0);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await closeDatabase();
  }
});
