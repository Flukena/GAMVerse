import assert from "node:assert/strict";
import test from "node:test";
import { Map2dPlayerFrames } from "./map2dPlayerFrames";

const DELTA_S = 1 / 60;
test("same stationary snapshot seat changes invalidate once and survive render metadata copying", () => {
  const frames = new Map2dPlayerFrames();
  const player = { x: 0, z: 0, rotation: 0, displayName: "Alice", username: "alice", sittingPropId: "" };
  const targets = new Map([["alice", player]]);
  frames.update(targets, "alice", DELTA_S);
  player.sittingPropId = "chair:seat";
  assert.equal(frames.update(targets, "alice", DELTA_S), true);
  const rendered = frames.players.get("alice");
  assert.equal(rendered?.sittingPropId, "chair:seat");
  assert.equal(rendered?.visual.motion, "seated");
  assert.equal(frames.update(targets, "alice", DELTA_S), false);
  player.sittingPropId = "";
  assert.equal(frames.update(targets, "alice", DELTA_S), true);
  assert.equal(rendered?.visual.motion, "idle");
  assert.equal(frames.update(targets, "alice", DELTA_S), false);
});
test("walking cues follow smoothed poses without mutating authority, then settle to idle", () => {
  const frames = new Map2dPlayerFrames();
  const player = { x: 0, z: 0, rotation: 0, displayName: "Alice", username: "alice" };
  const targets = new Map([["alice", player]]);
  frames.update(targets, "alice", DELTA_S);
  player.x = 1;
  frames.update(targets, "alice", DELTA_S);
  const rendered = frames.players.get("alice");
  assert.equal(rendered?.visual.motion, "walking");
  assert.ok(rendered && rendered.x > 0 && rendered.x < 1);
  assert.equal(player.x, 1);
  for (let index = 0; index < 120; index += 1) frames.update(targets, "alice", DELTA_S);
  assert.equal(rendered?.visual.motion, "idle");
  assert.equal(frames.update(targets, "alice", DELTA_S), false);
});
