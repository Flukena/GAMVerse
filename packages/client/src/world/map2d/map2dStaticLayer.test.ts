import assert from "node:assert/strict";
import test from "node:test";
import { map2dStaticCacheKey } from "./map2dStaticLayer";
test("static content cache distinguishes moving props without layout format revision", () => {
  const layout = {
    version: 1 as const,
    props: [
      {
        id: "p",
        asset: "desk" as const,
        x: 0,
        z: 0,
        width: 1,
        depth: 1,
        rotation: 0,
        collision: true,
      },
    ],
    zones: [],
    walls: [],
    doors: [],
  };
  const moved = {
    ...layout,
    props: layout.props.map((prop) => ({ ...prop, x: 2 })),
  };
  assert.notEqual(
    map2dStaticCacheKey(layout, 1, 12),
    map2dStaticCacheKey(moved, 1, 12),
  );
  assert.notEqual(
    map2dStaticCacheKey(layout, 1, 12),
    map2dStaticCacheKey(layout, 2, 12),
  );
});
