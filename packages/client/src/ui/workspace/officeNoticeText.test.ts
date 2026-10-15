import assert from "node:assert/strict";
import test from "node:test";
import { deskNoticeText } from "./officeNoticeText";

test("desk network failures have an actionable message instead of browser exception text", () => {
  for (const message of ["Failed to fetch", "TypeError: Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."]) {
    assert.equal(deskNoticeText(message), "Could not reach desk management. Check your connection and retry.");
  }
});
test("server desk rejection reasons remain visible", () => {
  const reason = "This desk is already claimed by another member.";
  assert.equal(deskNoticeText(reason), reason);
});
