import assert from "node:assert/strict";
import test from "node:test";
import { avatarSpriteDirectionIndex, avatarSpritePoseIndex, avatarSpriteSourceRect, avatarSpriteScreenRect } from "./avatarSpriteGeometry";

test("server yaw selects south, east, north and west sprites with wrapped angles", () => {
  assert.equal(avatarSpriteDirectionIndex(0), 0);
  assert.equal(avatarSpriteDirectionIndex(Math.PI / 2), 2);
  assert.equal(avatarSpriteDirectionIndex(Math.PI), 4);
  assert.equal(avatarSpriteDirectionIndex(-Math.PI / 2), 6);
  assert.equal(avatarSpriteDirectionIndex(Math.PI * 2), 0);
});
test("idle and sitting are distinct from the eight distance-driven walking poses", () => {
  assert.equal(avatarSpritePoseIndex({ motion: "idle", stridePhaseRad: 3 }), 0);
  assert.equal(avatarSpritePoseIndex({ motion: "seated", stridePhaseRad: 3 }), 9);
  const poses = Array.from({ length: 8 }, (_, index) => index * Math.PI / 4).map(stridePhaseRad => avatarSpritePoseIndex({ motion: "walking", stridePhaseRad }));
  assert.deepEqual(poses, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(avatarSpriteSourceRect(Math.PI, { motion: "walking", stridePhaseRad: Math.PI / 2 }),
    { x: 192, y: 320, width: 64, height: 80 });
});
test("character frame occupies 2.1 m at every zoom, anchored at its feet", () => {
  for (const pxPerM of [2, 12, 80]) {
    const rect = avatarSpriteScreenRect(400, 300, pxPerM);
    assert.ok(Math.abs(rect.height / pxPerM - 2.1) < 1e-12);
    assert.ok(Math.abs(rect.width / rect.height - 44 / 56) < 1e-12);
    assert.ok(Math.abs(rect.y - (300 - rect.height * 48 / 56)) < 1e-12);
  }
});
