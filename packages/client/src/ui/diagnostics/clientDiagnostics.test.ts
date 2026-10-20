import assert from "node:assert/strict";
import test from "node:test";
import { ClientDiagnosticBuffer } from "./clientDiagnostics";
import { CLIENT_DIAGNOSTIC_CODES } from "@gammyverse/shared";

test("client diagnostics coalesce repeated events and isolate office context at enqueue", () => {
  const buffer = new ClientDiagnosticBuffer();
  const event = { code: "frame_stall" as const, officeId: "office-a", metrics: { durationMs: 300 } };
  assert.equal(buffer.push(event, 0), true);
  assert.equal(buffer.push({ ...event, officeId: "office-b" }, 59_999), false);
  assert.equal(buffer.peek(59_999)?.event.officeId, "office-a");
  assert.equal(buffer.push({ ...event, officeId: "office-b" }, 60_000), true);
  buffer.finish(true);
  assert.equal(buffer.peek(60_000)?.event.officeId, "office-b");
});

test("failed deliveries retry at most three times and old queued events expire", () => {
  const buffer = new ClientDiagnosticBuffer();
  buffer.push({ code: "connection_drop", officeId: null, metrics: { closeCode: 1006 } }, 0);
  buffer.finish(false);
  buffer.finish(false);
  assert.equal(buffer.peek(10)?.attempts, 2);
  buffer.finish(false);
  assert.equal(buffer.peek(10), undefined);
  assert.equal(buffer.dropped, 1);
  buffer.push({ code: "browser_error", officeId: null, metrics: {} }, 10);
  assert.equal(buffer.peek(120_011), undefined);
  assert.equal(buffer.dropped, 2);
});

test("offline queue cannot grow beyond twenty technical events", () => {
  const buffer = new ClientDiagnosticBuffer();
  for (let round = 0; round < 3; round++) {
    for (const code of CLIENT_DIAGNOSTIC_CODES) buffer.push({ code, officeId: null, metrics: {} }, round * 60_000);
  }
  assert.equal(buffer.dropped, 7);
});
