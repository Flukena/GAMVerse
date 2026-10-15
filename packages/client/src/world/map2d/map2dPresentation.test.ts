import assert from "node:assert/strict";
import test from "node:test";
import { map2dStaticCacheKey } from "./map2dStaticLayer";
import { parseMap2dPresentationPreference, resolveMap2dPresentation } from "./map2dPresentation";
import { Map2dFrameChanges } from "./map2dFrameChanges";

test("presentation changes invalidate the static bitmap even at identical geometry and zoom", () => {
  assert.notEqual(map2dStaticCacheKey(null, 1, 12, "simplified"), map2dStaticCacheKey(null, 1, 12, "immersive"));
});
test("an idle map redraws immediately when only its presentation changes", () => {
  const changes = new Map2dFrameChanges();
  const input = { layout: null, configVersion: 1, widthM: 100, depthM: 100, view: "2d" as const,
    localId: null, speaking: new Set<string>(), decorations: [], nowMs: 0, presentation: "immersive" as const };
  const p = { center: { x: 0, z: 0 }, pxPerM: 12, widthPx: 800, heightPx: 600, dpr: 1 };
  changes.update(input, p, 0, 0);
  assert.equal(changes.update(input, p, 0, 0), false);
  assert.equal(changes.update({ ...input, presentation: "simplified" }, p, 0, 0), true);
});

test("auto keeps its previous presentation inside the zoom hysteresis band", () => {
  let presentation = resolveMap2dPresentation("auto", 7);
  assert.equal(presentation, "simplified");
  for (const scale of [9, 10, 11, 9, 11.9]) {
    presentation = resolveMap2dPresentation("auto", scale, presentation);
    assert.equal(presentation, "simplified");
  }
  presentation = resolveMap2dPresentation("auto", 12, presentation);
  assert.equal(presentation, "immersive");
  assert.equal(resolveMap2dPresentation("auto", 9, presentation), "immersive");
  assert.equal(resolveMap2dPresentation("auto", 8, presentation), "simplified");
});
test("manual preferences survive storage parsing and override zoom transitions", () => {
  for (const preference of ["simplified", "immersive"] as const) {
    const saved = parseMap2dPresentationPreference(preference);
    assert.equal(saved, preference);
    for (const scale of [1, 10, 80]) assert.equal(resolveMap2dPresentation(saved, scale), preference);
  }
  assert.equal(parseMap2dPresentationPreference(null), "auto");
  assert.equal(parseMap2dPresentationPreference("invalid"), "auto");
});
