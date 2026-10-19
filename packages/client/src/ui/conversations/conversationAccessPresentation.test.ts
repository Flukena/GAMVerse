import assert from "node:assert/strict";
import test from "node:test";
import { admittedTransportNotice, PRIVATE_ACCESS_POLICY_LABEL, PRIVATE_KNOCK_STATE_LABELS, remainingAccessTime } from "./conversationAccessPresentation";

const NOW_MS = 1_000;
const THIRTY_SECONDS_MS = 30_000;
const TEN_MINUTES_MS = 600_000;
test("knock and lease countdowns include the explicit bounded policy and clamp at expiry", () => {
  assert.match(PRIVATE_ACCESS_POLICY_LABEL, /GAMVerse policy/);
  assert.match(PRIVATE_ACCESS_POLICY_LABEL, /30 seconds/);
  assert.match(PRIVATE_ACCESS_POLICY_LABEL, /10 minutes/);
  assert.equal(remainingAccessTime(NOW_MS + THIRTY_SECONDS_MS, NOW_MS, "knock"), "30 seconds remaining");
  assert.equal(remainingAccessTime(NOW_MS + TEN_MINUTES_MS, NOW_MS, "guest"), "10 minutes remaining");
  assert.equal(remainingAccessTime(NOW_MS, NOW_MS, "knock"), "0 seconds remaining");
  assert.equal(remainingAccessTime(NOW_MS, NOW_MS + THIRTY_SECONDS_MS, "guest"), "0 seconds remaining");
});
test("revocation, expiration and decline have distinct non-admission outcomes", () => {
  assert.match(PRIVATE_KNOCK_STATE_LABELS.revoked, /revoked/);
  assert.match(PRIVATE_KNOCK_STATE_LABELS.expired, /expired/);
  assert.match(PRIVATE_KNOCK_STATE_LABELS.declined, /declined/);
});


test("unavailable private audio does not promise an active reconnect", () => {
  assert.equal(admittedTransportNotice("admitted", "unavailable"), "Admitted. Private audio is unavailable. An authorized occupant can retry.");
  assert.equal(admittedTransportNotice("admitted", "rotating"), "Admitted. Private audio is reconnecting.");
  assert.equal(admittedTransportNotice("admitted", "ready"), null);
  assert.equal(admittedTransportNotice("blocked", "unavailable"), null);
});

test("a stale UI clock cannot display more than the policy duration after a fresh admission or knock", () => {
  const staleClockLagMs = 500;
  assert.equal(remainingAccessTime(NOW_MS + TEN_MINUTES_MS, NOW_MS - staleClockLagMs, "guest"), "10 minutes remaining");
  assert.equal(remainingAccessTime(NOW_MS + THIRTY_SECONDS_MS, NOW_MS - staleClockLagMs, "knock"), "30 seconds remaining");
  assert.equal(remainingAccessTime(NOW_MS, NOW_MS + staleClockLagMs, "guest"), "0 seconds remaining");
});
