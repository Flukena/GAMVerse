import assert from "node:assert/strict";
import test from "node:test";
import { map2dSurfaceStyle, map2dSurfaceDetailVisible } from "./map2dSurfaceStyle";

test("room materials separate workspaces, meetings, restrooms and outdoor ground", () => {
  assert.equal(map2dSurfaceStyle("private").material, "carpet");
  assert.equal(map2dSurfaceStyle("meeting").material, "wood");
  assert.equal(map2dSurfaceStyle("restroom").material, "tile");
  assert.equal(map2dSurfaceStyle(null, true).material, "grass");
  assert.equal(map2dSurfaceStyle(null).material, "wood");
});

test("fine floor detail is visible at default play zoom and suppressed on the minimap", () => {
  assert.equal(map2dSurfaceDetailVisible(12), true);
  assert.equal(map2dSurfaceDetailVisible(2), false);
  assert.equal(map2dSurfaceDetailVisible(0), false);
});
