import assert from "node:assert/strict";
import test from "node:test";
import { CAMERA } from "@gammyverse/shared";
import { distanceZoomButtons, ZOOM_IN_SYMBOL, ZOOM_OUT_SYMBOL } from "./distanceZoom";

test("plus zooms the third-person camera in and minus zooms it out", () => {
  const [zoomOut, zoomIn] = distanceZoomButtons(30, 60);
  assert.equal(zoomIn.symbol, ZOOM_IN_SYMBOL);
  assert.equal(zoomIn.distanceM, 30 - CAMERA.zoomStep);
  assert.match(zoomIn.label, /^Zoom in /);
  assert.equal(zoomOut.symbol, ZOOM_OUT_SYMBOL);
  assert.equal(zoomOut.distanceM, 30 + CAMERA.zoomStep);
  assert.match(zoomOut.label, /^Zoom out /);
});

test("zoom in is disabled at the minimum distance and zoom out at the maximum", () => {
  const atMin = distanceZoomButtons(CAMERA.minZoom, 60);
  assert.equal(atMin[0].disabled, false);
  assert.equal(atMin[1].disabled, true);
  const atMax = distanceZoomButtons(60, 60);
  assert.equal(atMax[0].disabled, true);
  assert.equal(atMax[1].disabled, false);
});
