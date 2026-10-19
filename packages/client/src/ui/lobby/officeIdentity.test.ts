import assert from "node:assert/strict";
import test from "node:test";
import { duplicateOfficeNames, hasDuplicateOfficeName, officeIdCopyMessage, officeIdDisplay, OFFICE_ID_COPIED_LABEL, OFFICE_ID_COPY_MANUALLY_LABEL, OFFICE_ID_VISIBLE_LENGTH } from "./officeIdentity";

test("office id chips stay short while keeping the full id accessible and copyable", () => {
  const display = officeIdDisplay("0f8a1c2d-9b44-4e1a-9d33-7c0f1b2a3c4d");
  assert.equal(display.text, "0f8a1c2d…");
  assert.equal(display.text.length, OFFICE_ID_VISIBLE_LENGTH + 1);
  assert.equal(display.truncated, true);
  assert.equal(display.fullId, "0f8a1c2d-9b44-4e1a-9d33-7c0f1b2a3c4d");
  assert.equal(display.label, "Copy office ID 0f8a1c2d-9b44-4e1a-9d33-7c0f1b2a3c4d");
  assert.equal(display.title, "Office ID 0f8a1c2d-9b44-4e1a-9d33-7c0f1b2a3c4d");
});

test("short ids are shown in full without an ellipsis", () => {
  const display = officeIdDisplay(" abc123 ");
  assert.equal(display.text, "abc123");
  assert.equal(display.truncated, false);
  assert.equal(display.fullId, "abc123");
});

test("offices sharing a name are reported as duplicates regardless of case or padding", () => {
  const offices = [{ name: "Design" }, { name: " design " }, { name: "Sales" }];
  assert.deepEqual([...duplicateOfficeNames(offices)], ["design"]);
  assert.equal(hasDuplicateOfficeName(offices, "DESIGN"), true);
  assert.equal(hasDuplicateOfficeName(offices, "Sales"), false);
});

test("copy feedback announces success and an explicit manual-copy fallback on failure", () => {
  assert.equal(officeIdCopyMessage("idle"), "");
  assert.equal(officeIdCopyMessage("copied"), OFFICE_ID_COPIED_LABEL);
  assert.equal(officeIdCopyMessage("failed"), OFFICE_ID_COPY_MANUALLY_LABEL);
  assert.notEqual(OFFICE_ID_COPY_MANUALLY_LABEL.trim(), "");
});
