import assert from "node:assert/strict";
import test from "node:test";
import { isWorkspaceInputBlocked } from "./workspaceInput";
import "./liquidGlassPreview.test";

test("an open modal blocks capture-phase movement even without a target", () => {
  const scope = { querySelector(selector: string) { return selector.includes("dialog[open]") ? {} : null; } };
  assert.equal(isWorkspaceInputBlocked(null, scope), true);
});

test("movement remains available without an open modal or typing target", () => {
  assert.equal(isWorkspaceInputBlocked(null, { querySelector: () => null }), false);
});
