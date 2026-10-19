import assert from "node:assert/strict";
import test from "node:test";
import { drawMap2dDynamic } from "./map2dDynamicLayer";
import { drawMap2dRoomLabels } from "./map2dRoomLabels";
import { drawMap2dSimplified } from "./map2dSimplifiedDrawing";
import type { RoomLayoutZone } from "@gammyverse/shared";

function drawingContext() {
  const calls: { method: string; args: unknown[] }[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, method: string) => (...args: unknown[]) => {
      calls.push({ method, args });
      if (method === "measureText") return { width: String(args[0]).length * 7 };
      return undefined;
    },
    set: () => true,
  });
  return { ctx, calls };
}
const projection = { center: { x: 0, z: 0 }, pxPerM: 1, widthPx: 800, heightPx: 600, dpr: 1 };

test("overview room names remain full-size screen text even for a tiny room", () => {
  const { ctx, calls } = drawingContext();
  const zone = { id: "room", name: "Engineering", x: 10, z: 20, width: 2, depth: 2, kind: "meeting" } as RoomLayoutZone;
  drawMap2dRoomLabels(ctx, projection, [zone]);
  const text = calls.find((call) => call.method === "fillText");
  assert.ok(text);
  assert.equal(text.args[0], "Engineering");
  assert.equal(text.args.length, 3, "room names must not be horizontally compressed to tiny world bounds");
  const rect = calls.find((call) => call.method === "roundRect");
  assert.ok(rect && Number(rect.args[2]) > zone.width);
});
test("simplified people keep names, status and speaking rings while omitting facing geometry", () => {
  const player = { x: 10, z: 20, rotation: 1, username: "alice", displayName: "Alice" };
  const simple = drawingContext();
  const immersive = drawingContext();
  for (const [drawing, mode] of [[simple, "simplified"], [immersive, "immersive"]] as const)
    drawMap2dDynamic(drawing.ctx, projection, new Map([["alice", player]]), "alice", new Set(["alice"]), [], 0, undefined, mode);
  assert.equal(simple.calls.some((call) => call.method === "lineTo"), false);
  assert.equal(immersive.calls.some((call) => call.method === "lineTo"), true);
  assert.ok(simple.calls.some((call) => call.method === "fillText" && call.args[0] === "Alice"));
  assert.equal(simple.calls.filter((call) => call.method === "arc").length, 4);
  assert.equal(player.x, 10);
  assert.equal(player.z, 20);
});
test("simplified furniture preserves projected footprint and saved rotation", () => {
  const { ctx, calls } = drawingContext();
  drawMap2dSimplified(ctx, projection, { version: 1, walls: [], doors: [], zones: [], props: [
    { id: "desk", asset: "desk", x: 10, z: 20, width: 4, depth: 2, rotation: Math.PI / 2, collision: true },
  ] });
  assert.deepEqual(calls.find((call) => call.method === "translate")?.args, [410, 320]);
  assert.deepEqual(calls.find((call) => call.method === "rotate")?.args, [-Math.PI / 2]);
  assert.deepEqual(calls.find((call) => call.method === "fillRect")?.args, [-2, -1, 4, 2]);
  assert.equal(calls.some((call) => call.method === "drawImage"), false);
});
