import assert from "node:assert/strict";
import test from "node:test";
import { hasValidInternalServiceToken } from "./internalServiceAuth.js";
import { getRecentServerErrorCount, logServerError } from "./logger.js";
import { OfficeRoom } from "../offices/OfficeRoom.js";

test("internal service token comparison requires a long exact token", () => {
  const expected = "internal-service-token-for-operations-tests-123456";
  assert.equal(hasValidInternalServiceToken(expected, expected), true);
  assert.equal(hasValidInternalServiceToken(`${expected}x`, expected), false);
  assert.equal(hasValidInternalServiceToken(undefined, expected), false);
  assert.equal(hasValidInternalServiceToken("short", "short"), false);
});

test("structured error metric is bounded to the last fifteen minutes", () => {
  const now = Date.now();
  const previous = getRecentServerErrorCount(now);
  const originalError = console.error;
  console.error = () => undefined;
  try { logServerError("api", "qa.metric.test", new Error("qa")); }
  finally { console.error = originalError; }
  assert.equal(getRecentServerErrorCount(now), previous + 1);
  assert.equal(getRecentServerErrorCount(now + 16 * 60_000), 0);
});

test("realtime operations counts do not expose room details", () => {
  const counts = OfficeRoom.getOperationsCounts();
  assert.deepEqual(Object.keys(counts).sort(), ["activeParticipantCount", "activeRoomCount"]);
  assert.deepEqual(counts, { activeRoomCount: 0, activeParticipantCount: 0 });
});
