import assert from "node:assert/strict";
import test from "node:test";
import { customStatusFromFields, customStatusLabel } from "./AvailabilityPresentation";

const NOW_MS = 1_000_000;
test("custom status preserves emoji and hides expired content at the boundary", () => {
  const status = { customStatusText: "Deep work", customStatusEmoji: "🎯", customStatusExpiresAtMs: NOW_MS };
  assert.equal(customStatusLabel(status, NOW_MS - 1), "🎯 Deep work");
  assert.equal(customStatusLabel(status, NOW_MS), null);
  assert.equal(customStatusLabel({ ...status, customStatusExpiresAtMs: 0 }, NOW_MS), "🎯 Deep work");
});
test("canonical empty fields have no custom status and zero means no expiry", () => {
  assert.equal(customStatusFromFields({}), null);
  assert.deepEqual(customStatusFromFields({ customStatusEmoji: "☕", customStatusExpiresAtMs: 0 }), { text: "", emoji: "☕", expiresAtMs: null });
});
