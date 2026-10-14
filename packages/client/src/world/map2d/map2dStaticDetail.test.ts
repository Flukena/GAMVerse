import assert from "node:assert/strict";
import test from "node:test";
import { fitPropIconRect, map2dGridVisible, map2dZoneLabelFontPx, map2dPropStyle, map2dWallThicknessPx } from "./map2dStaticDetail";

test("room grid is suppressed at minimap scale and visible at readable metre spacing", () => {
  assert.equal(map2dGridVisible(2), false);
  assert.equal(map2dGridVisible(16), true);
});
test("zone labels suppress tiny scale and clamp readable font at high zoom", () => {
  assert.equal(map2dZoneLabelFontPx(2), 0);
  assert.equal(map2dZoneLabelFontPx(12), 12);
  assert.equal(map2dZoneLabelFontPx(80), 18);
});
test("prop icon retains aspect ratio inside local footprint before canvas rotation", () => {
  assert.deepEqual(fitPropIconRect(200, 100, 20, 40), { x: -10, y: -5, width: 20, height: 10 });
  assert.deepEqual(fitPropIconRect(100, 200, 40, 20), { x: -5, y: -10, width: 10, height: 20 });
});
test("walls remain legible at low zoom and preserve physical thickness when zoomed", () => {
  assert.equal(map2dWallThicknessPx(0.2, 1), 3);
  assert.equal(map2dWallThicknessPx(0.2, 80), 16);
});
test("nature fallback is green circle while furniture and vehicles differ", () => {
  assert.equal(map2dPropStyle("Nature · Trees", "tree-large").circle, true);
  assert.equal(map2dPropStyle("Sushi Restaurant", "pottedPlant").circle, true);
  assert.notEqual(map2dPropStyle("Vehicles", "car").color, map2dPropStyle("Furniture", "desk").color);
});

test("unmatched Food, Factory and Restroom groups have distinct fallback colours", () => {
  const colors = ["Food", "Factory", "Restroom"].map((group) => map2dPropStyle(group, "unclassified").color);
  assert.equal(new Set(colors).size, colors.length);
});
