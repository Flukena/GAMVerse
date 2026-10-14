import assert from "node:assert/strict";
import test from "node:test";
import { Map2dFrameChanges } from "./map2dFrameChanges";
import { Map2dPlayerFrames } from "./map2dPlayerFrames";
import type { Map2dPlayer } from "./map2dDynamicLayer";

const FRAME_DELTA_S = 1 / 60;
function frameInputs() {
  return {
    layout: null, configVersion: 0, widthM: 100, depthM: 100, view: "2d" as const,
    localId: "local", following: true, destination: { x: 0, z: 0 },
    speaking: new Set<string>(), decorations: [] as { sessionId: string; text: string; expiresAtMs: number }[], nowMs: 0,
  };
}
function projection() {
  return { center: { x: 0, z: 0 }, pxPerM: 12, widthPx: 800, heightPx: 600, dpr: 1 };
}
test("render players and map keep their identity through steady frames and mutate no server snapshot", () => {
  const frames = new Map2dPlayerFrames();
  const target: Map2dPlayer = { x: 0, z: 0, rotation: 0, username: "local", displayName: "Local" };
  const inputs = new Map([["local", target]]);
  const map = frames.players;
  assert.equal(frames.update(inputs, "local", FRAME_DELTA_S), true);
  const player = frames.players.get("local");
  assert.ok(player);
  assert.notEqual(player, target);
  assert.equal(frames.update(inputs, "local", FRAME_DELTA_S), false);
  target.x = 1;
  assert.equal(frames.update(inputs, "local", FRAME_DELTA_S), true);
  assert.equal(frames.players, map);
  assert.equal(frames.players.get("local"), player);
  assert.ok(player.x > 0 && player.x < target.x);
  assert.equal(target.x, 1);
});
test("same snapshot identity still exposes changed names, character, hand and status; leave removes pose", () => {
  const frames = new Map2dPlayerFrames();
  const target: Map2dPlayer = { x: 0, z: 0, rotation: 0, username: "local", displayName: "Local" };
  const inputs = new Map([["local", target]]);
  frames.update(inputs, "local", FRAME_DELTA_S);
  target.displayName = "Renamed";
  target.characterId = "character-male-b";
  target.handRaised = true;
  target.status = "do-not-disturb";
  assert.equal(frames.update(inputs, "local", FRAME_DELTA_S), true);
  assert.equal(frames.players.get("local")?.displayName, "Renamed");
  assert.equal(frames.players.get("local")?.characterId, "character-male-b");
  assert.equal(frames.players.get("local")?.handRaised, true);
  assert.equal(frames.players.get("local")?.status, "do-not-disturb");
  inputs.clear();
  assert.equal(frames.update(inputs, "local", FRAME_DELTA_S), true);
  assert.equal(frames.players.size, 0);
});
test("dirty comparison catches a speaking set mutated in place and skips unchanged idle frames", () => {
  const changes = new Map2dFrameChanges();
  const input = frameInputs();
  const p = projection();
  assert.equal(changes.update(input, p, 0, 0), true);
  assert.equal(changes.update(input, p, 0, 0), false);
  input.speaking.add("local");
  assert.equal(changes.update(input, p, 0, 0), true);
  assert.equal(changes.update(input, p, 0, 0), false);
  input.speaking.clear();
  assert.equal(changes.update(input, p, 0, 0), true);
});
test("decorations animate until expiry then redraw removal once", () => {
  const changes = new Map2dFrameChanges();
  const input = frameInputs();
  const p = projection();
  input.decorations.push({ sessionId: "local", text: "😊", expiresAtMs: 100 });
  assert.equal(changes.update(input, p, 0, 0), true);
  assert.equal(changes.update(input, p, 0, 0), true);
  assert.equal(changes.activeDecorations.length, 1);
  input.nowMs = 100;
  assert.equal(changes.update(input, p, 0, 0), true);
  assert.equal(changes.activeDecorations.length, 0);
  assert.equal(changes.update(input, p, 0, 0), false);
});
test("reused projection and destination objects still detect movement and resize", () => {
  const changes = new Map2dFrameChanges();
  const input = frameInputs();
  const p = projection();
  changes.update(input, p, 0, 0);
  p.center.x = 1;
  assert.equal(changes.update(input, p, 0, 0), true);
  assert.equal(changes.update(input, p, 0, 0), false);
  p.widthPx = 900;
  assert.equal(changes.update(input, p, 0, 0), true);
  input.destination.x = 5;
  assert.equal(changes.update(input, p, 0, 0), true);
});
test("image revisions, config, dimensions, local-player and resume invalidation wake an idle map", () => {
  const changes = new Map2dFrameChanges();
  const input = frameInputs();
  const p = projection();
  changes.update(input, p, 0, 0);
  assert.equal(changes.update(input, p, 1, 0), true);
  assert.equal(changes.update(input, p, 1, 1), true);
  assert.equal(changes.update(input, p, 1, 1), false);
  input.configVersion += 1;
  assert.equal(changes.update(input, p, 1, 1), true);
  input.widthM += 1;
  assert.equal(changes.update(input, p, 1, 1), true);
  input.localId = "other";
  assert.equal(changes.update(input, p, 1, 1), true);
  input.following = false;
  assert.equal(changes.update(input, p, 1, 1), true);
  assert.equal(changes.update(input, p, 1, 1), false);
  changes.invalidate();
  assert.equal(changes.update(input, p, 1, 1), true);
});
