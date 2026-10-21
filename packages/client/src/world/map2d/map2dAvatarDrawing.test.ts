import assert from "node:assert/strict";
import test from "node:test";
import { MAP2D_MIN_SCALE_PX_PER_M, MAP2D_MAX_SCALE_PX_PER_M } from "./constants";
import { avatarSpriteScale } from "./avatarSpriteGeometry";
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
test("fallback walks with alternating limbs, preserves the ground anchor and marks seating", () => {
  const avatar = player();
  const resting = drawingContext();
  drawMap2dAvatar(resting.ctx, projection, avatar, false, false, undefined, true);
  const walking = drawingContext();
  avatar.visual = { motion: "walking", stridePhaseRad: Math.PI / 2 };
  drawMap2dAvatar(walking.ctx, projection, avatar, false, false, undefined, true);
  const restingFeet = resting.calls.filter(call => call.method === "roundRect").slice(0, 2);
  const walkingFeet = walking.calls.filter(call => call.method === "roundRect").slice(0, 2);
  assert.equal(restingFeet[0].args[1], restingFeet[1].args[1]);
  assert.ok(Number(walkingFeet[0].args[1]) > Number(walkingFeet[1].args[1]));
  const seated = drawingContext();
  avatar.visual = { motion: "seated", stridePhaseRad: 0 };
  drawMap2dAvatar(seated.ctx, projection, avatar, false, false, undefined, true);
  assert.ok(seated.calls.filter(call => call.method === "roundRect").length > resting.calls.filter(call => call.method === "roundRect").length);
  for (const drawing of [resting, walking, seated])
    assert.deepEqual(drawing.calls.find(call => call.method === "translate")?.args, [400, 300]);
});
test("dense names preserve every head/status and hand/speaker cue in both presentations", () => {
  for (const presentation of ["simplified", "immersive"] as const) {
    const drawing = drawingContext();
    const alice = player();
    const bob = { ...player(), username: "bob", displayName: "Bob", handRaised: true };
    drawMap2dDynamic(drawing.ctx, projection, new Map([["bob", bob], ["alice", alice]]), "alice", new Set(["bob"]), [], 0, undefined, presentation);
    const arcs = drawing.calls.filter(call => call.method === "arc");
    assert.equal(arcs.filter(call => call.args[2] === 3 * avatarSpriteScale(projection.pxPerM)).length, 2, "each player retains a status dot");
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
  const headRadiusPx = 8;
  const markerRadiusPx = map2dHeadRadiusPx(projection.pxPerM);
  const headIndices = drawing.calls.flatMap((call, index) => call.method === "arc" && call.args[2] === headRadiusPx ? [index] : []);
  const lastHeadIndex = Math.max(...headIndices);
  const indicatorIndices = drawing.calls.flatMap((call, index) => {
    const ring = call.method === "arc" && call.args[0] === projection.widthPx / 2 && Number(call.args[2]) > markerRadiusPx;
    const hand = call.method === "fillText" && call.args[0] === "✋";
    return ring || hand ? [index] : [];
  });
  assert.equal(headIndices.length, 2);
  assert.ok(indicatorIndices.length >= 3);
  assert.ok(indicatorIndices.every(index => index > lastHeadIndex), "later heads must never overpaint a speaker ring or raised hand");
});


test("zoom scales full-body fallback geometry with the world", () => {
  const avatar = { ...player(), x: 2, z: 3 };
  const draws = [MAP2D_MIN_SCALE_PX_PER_M, 12, MAP2D_MAX_SCALE_PX_PER_M].map(pxPerM => {
    const drawing = drawingContext();
    drawMap2dAvatar(drawing.ctx, { ...projection, pxPerM }, avatar, false, false, undefined, true);
    return drawing.calls;
  });
  assert.notDeepEqual(draws[0].find(call => call.method === "scale")?.args, draws[2].find(call => call.method === "scale")?.args);
  assert.notDeepEqual(draws[0].find(call => call.method === "translate")?.args,
    draws[2].find(call => call.method === "translate")?.args);
});


test("selected characters grow and shrink proportionally with map zoom independent of DPR", () => {
  const image = {} as HTMLCanvasElement;
  const sprites = { get: () => image };
  const avatar = { ...player(), characterId: "character-pm-jimmy", x: 2, z: 3 };
  for (const dpr of [1, 2]) {
    const draws = [MAP2D_MIN_SCALE_PX_PER_M, 12, MAP2D_MAX_SCALE_PX_PER_M].map(pxPerM => {
      const drawing = drawingContext();
      drawMap2dAvatar(drawing.ctx, { ...projection, pxPerM, dpr }, avatar, false, false, sprites, true);
      return drawing.calls.find(call => call.method === "drawImage")!.args;
    });
    for (const [index, args] of draws.entries()) {
      assert.equal(args[0], image);
      const pxPerM = [MAP2D_MIN_SCALE_PX_PER_M, 12, MAP2D_MAX_SCALE_PX_PER_M][index];
      assert.ok(Math.abs(Number(args[8]) - 2.1 * pxPerM) < 0.000001);
      assert.ok(Math.abs(Number(args[7]) / Number(args[8]) - 44 / 56) < 0.000001);
      assert.equal(args.length, 9, "crop a directional full-body frame rather than a head portrait");
    }
    assert.notDeepEqual(draws[0].slice(5, 7), draws[2].slice(5, 7));
  }
  const idle = drawingContext();
  drawMap2dAvatar(idle.ctx, projection, avatar, false, false, sprites, false);
  avatar.visual = { motion: "walking", stridePhaseRad: Math.PI / 2 };
  const walking = drawingContext();
  drawMap2dAvatar(walking.ctx, projection, avatar, false, false, sprites, false);
  const idleArgs = idle.calls.find(call => call.method === "drawImage")!.args;
  const walkingArgs = walking.calls.find(call => call.method === "drawImage")!.args;
  assert.notEqual(idleArgs[1], walkingArgs[1], "walking selects a different atlas column even in Simplified mode");
  avatar.rotation = Math.PI;
  const turned = drawingContext();
  drawMap2dAvatar(turned.ctx, projection, avatar, false, false, sprites, true);
  assert.notEqual(walkingArgs[2], turned.calls.find(call => call.method === "drawImage")!.args[2]);
});

test("name clearance and foreground indicators track the scaled character at both zoom limits", () => {
  const avatar = { ...player(), handRaised: true };
  for (const pxPerM of [MAP2D_MIN_SCALE_PX_PER_M, MAP2D_MAX_SCALE_PX_PER_M]) {
    const drawing = drawingContext();
    drawMap2dDynamic(drawing.ctx, { ...projection, pxPerM }, new Map([["alice", avatar]]), "alice", new Set(["alice"]), [], 0);
    const scale = avatarSpriteScale(pxPerM);
    const markerRadiusPx = map2dHeadRadiusPx(pxPerM);
    const rings = drawing.calls.filter(call => call.method === "arc" && call.args[0] === 400 && Number(call.args[2]) > markerRadiusPx);
    assert.deepEqual(rings.map(call => call.args[2]), [markerRadiusPx + 4 * scale, markerRadiusPx + 8 * scale]);
    const label = drawing.calls.filter(call => call.method === "roundRect").at(-1)!;
    const characterTopPx = 300 - 48 * scale;
    assert.ok(Number(label.args[1]) + Number(label.args[3]) < characterTopPx, "name stays above the scaled full body");
  }
});

test("covered occupants lose only their individual names; open/local names and indicators stay", () => {
  const alice = player();
  const bob = { ...player(), x: 10, username: "bob", displayName: "Bob", handRaised: true };
  const players = new Map([["alice", alice], ["bob", bob]]);
  for (const presentation of ["simplified", "immersive"] as const) {
    const draw = (hiddenNameIds: ReadonlySet<string>) => {
      const drawing = drawingContext();
      drawMap2dDynamic(drawing.ctx, projection, players, "alice", new Set(["bob"]),
        [{ sessionId: "bob", text: "Hello", expiresAtMs: 100 }], 0, undefined, presentation, [], hiddenNameIds);
      return drawing.calls;
    };
    const open = draw(new Set());
    const covered = draw(new Set(["bob"]));
    const text = covered.filter(call => call.method === "fillText").map(call => call.args[0]);
    assert.ok(text.includes("Alice"));
    assert.equal(text.includes("Bob"), false);
    assert.ok(text.includes("✋"));
    assert.ok(text.includes("Hello"));
    assert.deepEqual(covered.filter(call => call.method === "arc"), open.filter(call => call.method === "arc"), "status/speaking/avatar indicators remain intact");
    assert.ok(open.some(call => call.method === "fillText" && call.args[0] === "Bob"), "name returns when room opens");
  }
});
