import assert from "node:assert/strict";
import test from "node:test";
import { isClientDiagnostic } from "./diagnostics.js";

const report = { code: "frame_stall", officeId: "6ab38a35-5227-4e93-99e1-d23624810a7b", metrics: { durationMs: 251 } };
test("diagnostics accept only the bounded technical contract, never arbitrary content", () => {
  assert.equal(isClientDiagnostic(report), true);
  assert.equal(isClientDiagnostic({ code: "browser_error", officeId: null, metrics: {} }), true);
  for (const value of [
    null, [], {}, { ...report, code: "cpu_peak" }, { ...report, officeId: "office" },
    { ...report, message: "private" }, { ...report, metrics: { stack: "private" } },
    { ...report, metrics: { cpuPercent: 100 } }, { ...report, metrics: { durationMs: Infinity } },
    { ...report, metrics: { durationMs: -1 } }, { ...report, metrics: { durationMs: 3_600_001 } },
    { ...report, metrics: { count: 1.5 } }, { ...report, metrics: [] },
  ]) assert.equal(isClientDiagnostic(value), false, JSON.stringify(value));
});
