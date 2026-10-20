import assert from "node:assert/strict";
import test from "node:test";
import type { HttpRequest, HttpResponse } from "../http/middleware.js";
import { realtimeMetricsEndpoint } from "./realtimeMetricsEndpoint.js";

const SERVICE_TOKEN = "isolated-runtime-metrics-test-service-token";
function reply() {
  const result = { status: 200, body: undefined as unknown, cacheControl: "" };
  const response = { sendStatus: (status: number) => { result.status = status; }, json: (body: unknown) => { result.body = body; }, setHeader: (_name: string, value: string) => { result.cacheControl = value; } };
  return { result, response: response as unknown as HttpResponse };
}

test("metrics endpoint denies missing/invalid internal credentials before collecting diagnostics", async () => {
  let reads = 0;
  const handler = realtimeMetricsEndpoint(SERVICE_TOKEN, async () => { reads++; return { ready: true, activeRoomCount: 1, activeParticipantCount: 2, recentErrorCount: 0 }; });
  for (const token of [undefined, "wrong"]) {
    const denied = reply();
    await handler({ header: () => token } as unknown as HttpRequest, denied.response);
    assert.equal(denied.result.status, 401);
    assert.equal(denied.result.body, undefined);
  }
  assert.equal(reads, 0);
  const allowed = reply();
  await handler({ header: () => SERVICE_TOKEN } as unknown as HttpRequest, allowed.response);
  assert.equal(reads, 1);
  assert.equal(allowed.result.cacheControl, "no-store");
  const body = allowed.result.body as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["activeParticipantCount", "activeRoomCount", "ready", "recentErrorCount", "runtime"]);
  assert.equal(body.activeParticipantCount, 2);
  assert.equal(JSON.stringify(body).includes(SERVICE_TOKEN), false);
});
