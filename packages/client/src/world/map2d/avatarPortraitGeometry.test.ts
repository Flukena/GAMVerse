import assert from "node:assert/strict";
import test from "node:test";
import { map2dHeadRadiusPx, map2dNameFontPx, map2dNamePillTopPx, portraitCropRect } from "./avatarPortraitGeometry";

test("ground markers scale proportionally with the character", () => {
  assert.ok(Math.abs(map2dHeadRadiusPx(12) - 6.75) < 1e-12);
  assert.equal(map2dHeadRadiusPx(80) / map2dHeadRadiusPx(1), 80);
});
test("name font stays fixed across zoom", () => {
  assert.equal(map2dNameFontPx(1), 11);
  assert.equal(map2dNameFontPx(12), 11);
  assert.equal(map2dNameFontPx(80), 11);
});
test("preview crop selects the head rather than the complete character", () => {
  assert.deepEqual(portraitCropRect(64, 64), { x: 13, y: 9, width: 38, height: 26 });
  assert.deepEqual(portraitCropRect(128, 128), { x: 26, y: 18, width: 76, height: 52 });
});

test("names sit wholly above the full character even at low zoom", () => {
  assert.equal(map2dNamePillTopPx(100, 14, 10), 60);
  assert.equal(map2dNamePillTopPx(100, 16, 13), 55);
});
