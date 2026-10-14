import assert from "node:assert/strict";
import test from "node:test";
import { minimapCanvasPoint } from "./minimapGeometry";

test("CSS fitting keeps minimap clicks mapped to the same canvas point", () => {
  const canvas = { width: 180, height: 140 };
  assert.deepEqual(minimapCanvasPoint({ x: 45, y: 35 }, { width: 90, height: 70 }, canvas), { x: 90, y: 70 });
  assert.deepEqual(minimapCanvasPoint({ x: 90, y: 70 }, canvas, canvas), { x: 90, y: 70 });
  assert.deepEqual(minimapCanvasPoint({ x: 90, y: 70 }, { width: 90, height: 70 }, canvas), { x: 180, y: 140 });
});
