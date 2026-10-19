import assert from "node:assert/strict";
import test from "node:test";
import { isOfficeShareAcceptance } from "./officeShareLinks.js";
const TOKEN_CHARACTERS_COUNT = 43;
test("share acceptance requires a complete URL-safe token", () => {
  assert.equal(isOfficeShareAcceptance({ token: "a".repeat(TOKEN_CHARACTERS_COUNT) }), true);
  for (const payload of [null, {}, { token: 7 }, { token: "short" }, { token: "/".repeat(TOKEN_CHARACTERS_COUNT) }]) {
    assert.equal(isOfficeShareAcceptance(payload), false);
  }
});
