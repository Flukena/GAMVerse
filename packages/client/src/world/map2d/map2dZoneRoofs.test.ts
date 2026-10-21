import assert from "node:assert/strict";
import test from "node:test";
import type { RoomLayoutZone } from "@gammyverse/shared";
import { drawMap2dZoneRoofs } from "./map2dZoneRoofs";
const room: RoomLayoutZone = { id: "room", name: "Room", kind: "meeting", x: 0, z: 0, width: 10, depth: 10, color: "#fff" };
test("2D roof covers the room bounds and lists only current occupants", () => {
  const calls: { method: string; args: unknown[] }[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, method: string) => (...args: unknown[]) => {
      calls.push({ method, args });
      if (method === "measureText") return { width: String(args[0]).length * 7 };
    },
    set: () => true,
  });
  drawMap2dZoneRoofs(ctx, { center: { x: 0, z: 0 }, pxPerM: 10, widthPx: 800, heightPx: 600, dpr: 1 }, [room], [
    { x: 0, z: 0, displayName: "Alice", username: "a" },
    { x: 20, z: 0, displayName: "Bob", username: "b" },
  ]);
  assert.deepEqual(calls.find(call => call.method === "fillRect")?.args, [350, 250, 100, 100]);
  assert.deepEqual(calls.filter(call => call.method === "fillText").map(call => call.args[0]), ["Alice"]);
});

test("roof cards align names left and status dots right, including status-only updates", () => {
  const players = [
    { x: 0, z: 0, displayName: "Alice", username: "a", status: "available" },
    { x: 1, z: 0, displayName: "B", username: "b", status: "do-not-disturb" },
  ];
  const draw = () => {
    const calls: { method: string; args: unknown[]; color: unknown; textAlign: unknown }[] = [];
    const properties: Record<string, unknown> = {};
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get: (_target, method: string) => (...args: unknown[]) => {
        calls.push({ method, args, color: properties.fillStyle, textAlign: properties.textAlign });
        if (method === "measureText") return { width: String(args[0]).length * 7 };
      },
      set: (_target, property: string, value) => { properties[property] = value; return true; },
    });
    drawMap2dZoneRoofs(ctx, { center: { x: 0, z: 0 }, pxPerM: 10, widthPx: 800, heightPx: 600, dpr: 1 }, [room], players);
    return calls;
  };
  const first = draw();
  const names = first.filter(call => call.method === "fillText");
  const dots = first.filter(call => call.method === "arc");
  assert.deepEqual(names.map(call => call.args[0]), ["Alice", "B"]);
  assert.ok(names.every(call => call.textAlign === "left"));
  assert.equal(names[0].args[1], names[1].args[1]);
  assert.equal(dots[0].args[0], dots[1].args[0]);
  assert.ok(Number(dots[0].args[0]) > Number(names[0].args[1]));
  assert.deepEqual(dots.map(call => call.color), ["#2f9e62", "#dc3545"]);
  assert.ok(first.some(call => call.method === "roundRect"));
  players[0].status = "in-meeting";
  assert.equal(draw().find(call => call.method === "arc")?.color, "#7950c7");
});
