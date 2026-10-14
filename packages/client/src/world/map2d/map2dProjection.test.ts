import assert from "node:assert/strict";
import test from "node:test";
import { MAP2D_MAX_SCALE_PX_PER_M } from "./constants";
import {
  worldToScreen,
  screenToWorld,
  fitMap2dProjection,
  map2dWheelScale,
  type Map2dProjection,
} from "./map2dProjection";
const PROJECTION: Map2dProjection = {
  center: { x: 4, z: -7 },
  pxPerM: 12,
  widthPx: 800,
  heightPx: 600,
  dpr: 2,
};
test("orthographic mapping round trips world coordinates with DPR and north up", () => {
  const world = { x: 19, z: -15 };
  const screen = worldToScreen(PROJECTION, world);
  assert.equal(screen.x, 580);
  assert.equal(screen.y, 204);
  assert.deepEqual(screenToWorld(PROJECTION, screen), world);
  assert.deepEqual(worldToScreen({ ...PROJECTION, dpr: 1 }, world), screen);
});
test("minimap fits the entire world and inverse click mapping keeps its centre", () => {
  const projection = fitMap2dProjection(200, 100, 180, 140);
  assert.deepEqual(worldToScreen(projection, { x: -100, z: 0 }), {
    x: 0,
    y: 70,
  });
  assert.deepEqual(worldToScreen(projection, { x: 100, z: 0 }), {
    x: 180,
    y: 70,
  });
  assert.deepEqual(screenToWorld(projection, { x: 90, y: 70 }), { x: 0, z: 0 });
});

test("wheel scroll up zooms in, scroll down zooms out, and result is clamped", () => {
  const WHEEL_PX = 100;
  const START_PX_PER_M = 10;
  assert.ok(map2dWheelScale(START_PX_PER_M, -WHEEL_PX) > START_PX_PER_M);
  assert.ok(map2dWheelScale(START_PX_PER_M, WHEEL_PX) < START_PX_PER_M);
  assert.equal(map2dWheelScale(MAP2D_MAX_SCALE_PX_PER_M, -WHEEL_PX), MAP2D_MAX_SCALE_PX_PER_M);
});
