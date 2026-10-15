import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkspaceTheme, resolveWorkspaceTheme } from "./workspaceTheme";

test("unknown or absent saved themes follow system appearance", () => {
  assert.equal(parseWorkspaceTheme(null), "system");
  assert.equal(parseWorkspaceTheme("sepia"), "system");
  assert.equal(parseWorkspaceTheme("dark"), "dark");
  assert.equal(parseWorkspaceTheme("light"), "light");
});

test("explicit themes override system appearance and system follows changes", () => {
  assert.equal(resolveWorkspaceTheme("light", true), "light");
  assert.equal(resolveWorkspaceTheme("dark", false), "dark");
  assert.equal(resolveWorkspaceTheme("system", true), "dark");
  assert.equal(resolveWorkspaceTheme("system", false), "light");
});
