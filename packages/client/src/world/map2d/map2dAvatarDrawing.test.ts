import assert from "node:assert/strict";
import test from "node:test";
import { map2dHeadRadiusPx } from "./avatarPortraitGeometry";
import { drawMap2dAvatar } from "./map2dAvatarDrawing";
import { drawMap2dDynamic } from "./map2dDynamicLayer";
import type { Map2dRenderedPlayer } from "./map2dAvatarVisual";

const projection = { center: { x: 0, z: 0 }, pxPerM: 12, widthPx: 800, heightPx: 600, dpr: 1 };
function drawingContext() {
  const calls: { method: string; args: unknown[] }[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, method: string) => (...args: unknown[]) => {
      calls.push({ method, args });
      return method === "measureText" ? { width: String(args[0]).length * 7 } : undefined;
    },
    set: () => true,
  });
  return { ctx, calls };
}
function player(): Map2dRenderedPlayer {
  return { x: 0, z: 0, rotation: 0, displayName: "Alice", username: "alice", visual: { motion: "idle", stridePhaseRad: 0 } };
}
test("walking alternates feet, seated replaces them with chair geometry, head center stays fixed", () => {
  const avatar = player();
  const resting = drawingContext();
  drawMap2dAvatar(resting.ctx, projection, avatar, false, false, undefined, true);
  const walking = drawingContext();
  avatar.visual = { motion: "walking", stridePhaseRad: Math.PI / 2 };
  drawMap2dAvatar(walking.ctx, projection, avatar, false, false, undefined, true);
  const restingFeet = resting.calls.filter(call => call.method === "roundRect").slice(1);
  const walkingFeet = walking.calls.filter(call => call.method === "roundRect").slice(1);
  assert.equal(restingFeet.length, 2);
  assert.equal(walkingFeet.length, 2);
  assert.equal(restingFeet[0].args[1], restingFeet[1].args[1]);
  assert.ok(Number(walkingFeet[0].args[1]) > Number(walkingFeet[1].args[1]));
  const seated = drawingContext();
  avatar.visual = { motion: "seated", stridePhaseRad: 0 };
  drawMap2dAvatar(seated.ctx, projection, avatar, false, false, undefined, true);
  assert.equal(seated.calls.filter(call => call.method === "roundRect").length, 2);
  for (const drawing of [resting, walking, seated])
    assert.deepEqual(drawing.calls.find(call => call.method === "arc")?.args.slice(0, 2), [400, 300]);
});
test("dense names preserve every head/status and hand/speaker cue in both presentations", () => {
  for (const presentation of ["simplified", "immersive"] as const) {
    const drawing = drawingContext();
    const alice = player();
    const bob = { ...player(), username: "bob", displayName: "Bob", handRaised: true };
    drawMap2dDynamic(drawing.ctx, projection, new Map([["bob", bob], ["alice", alice]]), "alice", new Set(["bob"]), [], 0, undefined, presentation);
    const arcs = drawing.calls.filter(call => call.method === "arc");
    assert.equal(arcs.length, 6, "two heads, two status dots, one local and one speaking ring");
    const text = drawing.calls.filter(call => call.method === "fillText").map(call => call.args[0]);
    assert.ok(text.includes("✋"), "raised hands must survive name suppression");
    assert.ok(text.includes("Alice"));
    assert.equal(text.includes("Bob"), false);
    const lastHeadIndex = drawing.calls.map(call => call.method).lastIndexOf("arc");
    const firstNameIndex = drawing.calls.findIndex(call => call.method === "fillText" && call.args[0] === "Alice");
    assert.ok(firstNameIndex > lastHeadIndex, "names render after all avatar geometry");
  }
});

test("dense-scene speaking rings and raised hands render after every head", () => {
  const drawing = drawingContext();
  const alice = player();
  const bob = { ...player(), username: "bob", displayName: "Bob", handRaised: true };
  drawMap2dDynamic(drawing.ctx, projection, new Map([["bob", bob], ["alice", alice]]), "alice", new Set(["bob"]), [], 0);
  const headRadiusPx = map2dHeadRadiusPx(projection.pxPerM);
  const headIndices = drawing.calls.flatMap((call, index) => call.method === "arc" && call.args[2] === headRadiusPx ? [index] : []);
  const lastHeadIndex = Math.max(...headIndices);
  const indicatorIndices = drawing.calls.flatMap((call, index) => {
    const ring = call.method === "arc" && Number(call.args[2]) > headRadiusPx;
    const hand = call.method === "fillText" && call.args[0] === "✋";
    return ring || hand ? [index] : [];
  });
  assert.equal(headIndices.length, 2);
  assert.ok(indicatorIndices.length >= 3);
  assert.ok(indicatorIndices.every(index => index > lastHeadIndex), "later heads must never overpaint a speaker ring or raised hand");
});
