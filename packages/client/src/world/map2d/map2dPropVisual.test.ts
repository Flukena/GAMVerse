import assert from "node:assert/strict";
import test from "node:test";
import { map2dPropDetailVisible, map2dPropKind } from "./map2dPropVisual";

test("actual desk, seat and storage assets get their furniture silhouette", () => {
  assert.equal(map2dPropKind("desk"), "table");
  assert.equal(map2dPropKind("kit:chairdesk"), "chair");
  assert.equal(map2dPropKind("quaternius-sushi-sofa"), "sofa");
  assert.equal(map2dPropKind("kit:benchcushion"), "bench");
  assert.equal(map2dPropKind("kit:bookcaseopen"), "bookcase");
  assert.equal(map2dPropKind("kit:bookcasecloseddoors"), "storage");
});
test("monitor and foliage use actual object name, not pack name", () => {
  assert.equal(map2dPropKind("computerScreen"), "monitor");
  assert.equal(map2dPropKind("pottedPlant"), "plant");
  assert.equal(map2dPropKind("nature-riclmbr-low-poly-trees-palm-tree"), "tree");
  assert.equal(map2dPropKind("nature-riclmbr-low-poly-trees-stump"), "fallback");
});
test("unsupported compound geometry and unrelated names retain catalog previews", () => {
  for (const asset of ["kit:deskcorner", "kit:loungesofacorner", "kit:lamproundtable", "kit:tablecloth", "kit:computermouse", "unknown-chairlift"])
    assert.equal(map2dPropKind(asset), "fallback", asset);
});
test("fine furniture detail requires readable width and depth", () => {
  assert.equal(map2dPropDetailVisible(8, 8), false);
  assert.equal(map2dPropDetailVisible(60, 5), false);
  assert.equal(map2dPropDetailVisible(12, 12), true);
  assert.equal(map2dPropDetailVisible(120, 40), true);
});
