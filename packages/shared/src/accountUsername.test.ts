import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAccountUsername } from "./accountUsername.js";

test("account and DM usernames share canonical trimmed lowercase identity", () => {
  assert.equal(
    normalizeAccountUsername("  AlIce.Test_123  "),
    "alice.test_123",
  );
  for (const invalid of [
    undefined,
    null,
    123,
    "a",
    "x".repeat(25),
    "alice/bob",
    "alice bob",
    "Álice",
  ]) {
    assert.equal(normalizeAccountUsername(invalid), null);
  }
});
