import assert from "node:assert/strict";
import test from "node:test";
import { type RoomLayout } from "@gammyverse/shared";
import { drawMap2dWalls } from "./map2dWallDrawing";

test("vertical doorway stays clear of solid wall fills and shadows at play and minimap scales", () => {
  const layout: RoomLayout = { version: 1, props: [], zones: [],
    walls: [{ id: "wall", axis: "vertical", x: 0, z: 0, length: 10, thickness: 0.2, height: 2 }],
    doors: [{ id: "opening", wallId: "wall", offset: 0, width: 2, kind: "opening" }] };
  for (const pxPerM of [2, 12]) {
    const fills: Array<{ top: number; bottom: number }> = [];
    const ctx = { save() {}, restore() {}, strokeRect() {},
      fillRect(_x: number, y: number, _width: number, height: number) { fills.push({ top: y, bottom: y + height }); },
    } as unknown as CanvasRenderingContext2D;
    drawMap2dWalls(ctx, { center: { x: 0, z: 0 }, pxPerM, widthPx: 200, heightPx: 200, dpr: 1 }, layout);
    const openingTopPx = 100 - pxPerM;
    const openingBottomPx = 100 + pxPerM;
    assert.ok(fills.length > 0, "solid spans are rendered");
    for (const fill of fills) {
      assert.ok(fill.bottom <= openingTopPx || fill.top >= openingBottomPx,
        `wall fill at ${pxPerM}px/m intrudes into doorway`);
    }
  }
});
