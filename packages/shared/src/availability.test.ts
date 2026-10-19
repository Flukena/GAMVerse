import assert from "node:assert/strict";
import test from "node:test";
import { availabilityPolicy, CUSTOM_STATUS_EMOJI_MAX_CODE_POINTS, CUSTOM_STATUS_MAX_DURATION_MS, CUSTOM_STATUS_TEXT_MAX_CODE_POINTS, effectiveAvailability, isValidUserStatusCommand, USER_STATUSES } from "./availability.js";
const NOW_MS = 1_000_000;
const STATUS = { text: "Writing", emoji: "✍️", expiresAtMs: NOW_MS + 1000 };

test("legacy status commands remain accepted and explicit Away is distinct", () => {
  for (const status of USER_STATUSES) assert.equal(isValidUserStatusCommand({ status }, NOW_MS), true);
  assert.equal(isValidUserStatusCommand({ status: "offline" }, NOW_MS), false);
});
test("suppression applies only to Busy, meeting and Away", () => {
  for (const status of USER_STATUSES) {
    const suppressed = ["do-not-disturb", "in-meeting", "away"].includes(status);
    assert.deepEqual(availabilityPolicy(status), { suppressAutomaticMedia: suppressed, suppressInterruptions: suppressed });
  }
});
test("custom status uses Unicode code point bounds", () => {
  assert.equal(isValidUserStatusCommand({ status: "available", customStatus: { ...STATUS, text: "🎉".repeat(CUSTOM_STATUS_TEXT_MAX_CODE_POINTS), emoji: "🎉".repeat(CUSTOM_STATUS_EMOJI_MAX_CODE_POINTS) } }, NOW_MS), true);
  for (const customStatus of [
    { ...STATUS, text: "a".repeat(CUSTOM_STATUS_TEXT_MAX_CODE_POINTS + 1) },
    { ...STATUS, emoji: "a".repeat(CUSTOM_STATUS_EMOJI_MAX_CODE_POINTS + 1) },
    { ...STATUS, text: "secret\nline" }, { ...STATUS, emoji: "\u0000" },
  ]) assert.equal(isValidUserStatusCommand({ status: "away", customStatus }, NOW_MS), false);
});
test("expiry rejects past, nonfinite and beyond maximum while null clears", () => {
  for (const expiresAtMs of [NOW_MS, NOW_MS - 1, Infinity, NaN, NOW_MS + CUSTOM_STATUS_MAX_DURATION_MS + 1]) {
    assert.equal(isValidUserStatusCommand({ status: "away", customStatus: { ...STATUS, expiresAtMs } }, NOW_MS), false);
  }
  assert.equal(isValidUserStatusCommand({ status: "away", customStatus: { ...STATUS, expiresAtMs: NOW_MS + CUSTOM_STATUS_MAX_DURATION_MS } }, NOW_MS), true);
  assert.equal(isValidUserStatusCommand({ status: "away", customStatus: null }, NOW_MS), true);
});
test("expiry clears only custom status at boundary, preserving availability", () => {
  const profile = { status: "away" as const, customStatus: STATUS };
  assert.deepEqual(effectiveAvailability(profile, STATUS.expiresAtMs - 1), profile);
  assert.deepEqual(effectiveAvailability(profile, STATUS.expiresAtMs), { status: "away", customStatus: null });
});

test("optional request correlation is bounded and rejects malformed IDs", () => {
  assert.equal(isValidUserStatusCommand({ status: "away", requestId: "request-123" }, NOW_MS), true);
  for (const requestId of ["", "x".repeat(65), "bad id", 1]) {
    assert.equal(isValidUserStatusCommand({ status: "away", requestId }, NOW_MS), false);
  }
});
