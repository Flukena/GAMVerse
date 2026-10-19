import assert from "node:assert/strict";
import test from "node:test";
import { CUSTOM_STATUS_TEXT_MAX_CODE_POINTS } from "@gammyverse/shared";
import { availabilityDraftCommand } from "./AvailabilityEditor";

const NOW_MS = 1_000_000;
const THIRTY_MINUTES_MS = 1_800_000;
const CURRENT_STATUS = { text: "Working", emoji: "🎯", expiresAtMs: NOW_MS + THIRTY_MINUTES_MS };
test("editing preserves the existing expiry until a different duration is selected", () => {
  assert.deepEqual(availabilityDraftCommand("away", " Break ", " ☕ ", "keep", CURRENT_STATUS, NOW_MS), {
    status: "away", customStatus: { text: "Break", emoji: "☕", expiresAtMs: CURRENT_STATUS.expiresAtMs },
  });
  assert.equal(availabilityDraftCommand("available", "Working", "", "30m", null, NOW_MS)?.customStatus?.expiresAtMs, NOW_MS + THIRTY_MINUTES_MS);
});
test("clear is explicit null, while invalid length and expired keep are rejected", () => {
  assert.deepEqual(availabilityDraftCommand("available", " ", "", "keep", CURRENT_STATUS, NOW_MS), { status: "available", customStatus: null });
  assert.equal(availabilityDraftCommand("available", "x".repeat(CUSTOM_STATUS_TEXT_MAX_CODE_POINTS + 1), "", "never", null, NOW_MS), null);
  assert.equal(availabilityDraftCommand("available", "Working", "", "keep", { ...CURRENT_STATUS, expiresAtMs: NOW_MS }, NOW_MS), null);
});
test("text limits count Unicode code points rather than UTF-16 units", () => {
  assert.notEqual(availabilityDraftCommand("available", "😀".repeat(CUSTOM_STATUS_TEXT_MAX_CODE_POINTS), "", "never", null, NOW_MS), null);
});
