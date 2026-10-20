# Office scene frame cost

## Evidence and acceptance

Baseline: main `2c8d9b1`, Chrome on Mac, 1440 × 900, device pixel ratio 1,
one participant in the reported office. A short requestAnimationFrame sample
measured 27 FPS idle, 25 FPS walking and rotating; frame p95 was about 50 ms.
CPU profiling identified Three.js scene traversal, world matrix updates and
shadow traversal. The scene contained 50,336 objects and 24,301 meshes.
Temporarily disabling shadows improved 26.5 FPS to 40 FPS; shadows were restored.
Server step p95 was 0.28 ms. These are local observations, not capacity claims.

## Delivery: one playable merge request

1. Add a focused scene optimization module. Cache transforms only for explicitly
   static content after placement and async loading. Keep characters, doors,
   vehicles, editor previews and other animated content live.
2. Extend existing visibility handling to skip entire static subtrees when safe.
   Preserve camera-visible geometry and shadow casters; do not blindly remove
   offscreen objects whose shadows can appear onscreen. Reuse existing scenery
   instancing. Add batching only if measurements show it is necessary.
3. Keep shadows and visual quality enabled by default. Reduce redundant static
   matrix work first; any shadow change needs measured evidence and visual checks.
4. Verify real Three.js transforms, parent movement, late-loaded content,
   visibility re-entry and dynamic exclusions. Demonstrate regression tests fail
   without the optimization. Run the full build and relevant client tests.
5. Repeat the original office's idle/walking/rotation measurements at the same
   viewport. Check 2D/3D switching and editing without saving map changes. Aim for
   60 FPS, report actual results, and do not claim success from unit tests alone.
6. Independent review, resolve findings, push a branch and open a PR to upstream
   main. No production deployment or persistent map/data changes in this work.

## Scope boundaries

No server movement, authorization, persistence, assets or dependency changes.
More aggressive shadow caching and broader instancing remain follow-ups unless
needed to meet measured acceptance safely. Profiling artifacts and command logs
belong on the external data volume, not in the repository.

## Implementation and verification — 2026-10-20

Implemented `StaticSceneGroup` for explicitly static model/floor/wall roots and
`OfficeMapSceneLayers` for hidden picking geometry and inactive editor overlays.
The cache compares actual world matrices; root/ancestor movement, late content
and editor/vehicle handle changes refresh the relevant subtree. Shadows,
geometry, existing instancing and distance culling retain their settings.

- Full `pnpm build`: passed (existing bundle size warning).
- Eight new Three.js regression tests: passed. Bypassing the cache produced
  the expected descendant-visit failure (7 pass / 1 fail); restoring it passes.
- Full client suite: main 361/364 pass, candidate 369/372 pass. Both have the same
  three existing failures: two voice-session teardown/microphone-intent cases
  and the 2D overview room-name sizing case. No skipped tests or changed gates.
- Browser uses the same live office/API with candidate modules served only to
  the isolated test window. Chrome, 1440 × 900, DPR 1, one connected participant.
  Assets were allowed to finish loading before samples. Shadows remained on.

| Measurement | Main | Candidate |
| --- | ---: | ---: |
| Matched-view stationary FPS, 6-second samples | 29.2 | 56.3 |
| Matched-view stationary frame interval p95 | 49.7 ms | 32.2 ms |
| Repeat candidate stationary FPS, 4-second sample | — | 59.8 |
| Walking FPS, 4-second sample | original diagnosis 25.3 | 57.8 |
| Rotating camera FPS, 3/4-second samples | original diagnosis 25.0 | 56.0 |

The paired stationary screenshots were visually checked with matching camera
framing. Movement measurements describe short local runs, not a controlled
cross-device or multiplayer capacity benchmark. Some frame misses remain; this
change does not promise sustained 60 FPS on every map or machine.

Browser interaction checks passed for 2D → 3D switching, editor overlay entry,
selecting a placed trashcan, moving its local draft with aligned preview/highlight,
and cancelling the draft without saving. No new browser errors appeared.
Vehicle driving/parking and two-session multiplayer were not exercised; live
vehicle handle movement is covered by the new Three.js regression test.
