import assert from "node:assert/strict";
import test from "node:test";
import { AvatarPortraits } from "./avatarPortraits";
import type { queueAvatarSnapshot } from "./avatarPortraitSnapshot";

test("atlas budget includes pending snapshots, so a crowded scene cannot keep rebuilding its avatars", () => {
  const requests: Parameters<typeof queueAvatarSnapshot>[0][] = [];
  const portraits = new AvatarPortraits(request => requests.push(request));
  try {
    for (let index = 0; index < 21; index += 1) portraits.get(`character-${index}`);
    assert.equal(requests.length, 20);
  } finally { portraits.dispose(); }
});

test("visible atlases stay pinned and evicted characters can reload after the active set changes", () => {
  const originalAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelFrame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const requests: Parameters<typeof queueAvatarSnapshot>[0][] = [];
  const portraits = new AvatarPortraits(request => requests.push(request));
  const ids = Array.from({ length: 21 }, (_, index) => `character-${index}`);
  const canvas = {} as HTMLCanvasElement;
  try {
    portraits.setActiveCharacters(ids);
    for (const id of ids) {
      const requestCount = requests.length;
      portraits.get(id);
      if (requests.length > requestCount) requests.at(-1)!.complete(canvas);
    }
    assert.equal(requests.length, 20);
    assert.equal(portraits.get(ids[0]), canvas, "overflow cannot retire an active selected character");
    portraits.setActiveCharacters(ids.slice(1));
    portraits.get(ids[20]);
    assert.equal(requests.length, 21);
    requests.at(-1)!.complete(canvas);
    portraits.setActiveCharacters([ids[0]]);
    portraits.get(ids[0]);
    assert.equal(requests.length, 22, "an evicted character must remain eligible for reloading");
    requests.at(-1)!.complete(canvas);
    assert.equal(portraits.get(ids[0]), canvas);
    portraits.dispose();
    assert.equal(requests.at(-1)!.active(), false);
    requests.at(-1)!.complete(canvas);
    assert.equal(portraits.get(ids[0]), null, "late completion cannot repopulate a disposed cache");
  } finally {
    portraits.dispose();
    globalThis.requestAnimationFrame = originalAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelFrame;
  }
});
