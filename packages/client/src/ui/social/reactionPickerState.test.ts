import assert from "node:assert/strict";
import test from "node:test";
import { reactionPickerOpen } from "./reactionPickerState";

test("dock toggle opens the picker and a second toggle closes it", () => {
  assert.equal(reactionPickerOpen(false, "toggle"), true);
  assert.equal(reactionPickerOpen(true, "toggle"), false);
});

test("selection, Escape, outside press and focus leaving dismiss an open picker", () => {
  for (const event of ["select", "escape", "outside", "blur"] as const) {
    assert.equal(reactionPickerOpen(true, event), false);
    assert.equal(reactionPickerOpen(false, event), false);
  }
});
