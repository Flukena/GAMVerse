# Character camera and view: development plan

Drafted: 2026-10-12

This plan comes from a read-only review of the current checkout. Nothing in it has been run in a browser yet. Line numbers are approximate; re-locate code with `codegraph explore` before editing.

## Current behavior (2026-10-15)

The owner requires explicit 2D/3D switching through the mode control or M. Wheel and toolbar zoom stay in the selected view, including at the 3D distance limit. The previous threshold-driven view transitions described below are superseded; the campus-fit ratio now only bounds 3D distance.

## Current structure

| Concern | Location |
|---|---|
| Camera constants | `CAMERA`, `DEFAULT_CAMERA_YAW` — `packages/shared/src/index.ts:264-274` |
| Camera state (yaw, elevation, zoom, pan, mode flags) | refs in `WorldCanvas` — `packages/client/src/world/WorldCanvas.tsx:647-675` |
| Camera pose per frame | render loop — `WorldCanvas.tsx:2874-2972` |
| Mouse/pointer-lock input | `WorldCanvas.tsx:1946-2195` |
| TPP/FPP toggle | button `onClick` — `WorldCanvas.tsx:3347` |
| Screen → world movement | `screenMovementToWorld` — `packages/shared/src/index.ts:327`, called from `OfficeApp.tsx:2039` |
| Avatar facing (authoritative) | `player.rotation = atan2(intent)` — `packages/server/src/offices/OfficeRoom.ts:1191` |
| Avatar facing (render) | `avatar.rotation.y = lerp(...)` — `WorldCanvas.tsx:2727` |

The modes are implicit. They are derived from `firstPersonViewRef`, `campusCharacterFocusedRef`, `campusOverviewRef`, `campusZoomRef >= CAMPUS_2D_ZOOM_THRESHOLD`, `mapEditMode` and `buildMode`. Several one-shot request flags change transitions: `alignThirdPersonBehindRef`, `thirdPersonCloseRequestRef` and `focusCharacterRequestRef`.

| Mode | Camera |
|---|---|
| TPP | follows the avatar with a 0.68 shoulder offset, FOV 38, right-drag orbit, elevation 8°–68° |
| FPP | eye height 1.42, FOV 68, pointer-lock mouse look, avatar hidden, viewmodel shown |
| Free | looks at `cameraPanTarget` after a manual pan or orbit |
| 2D map | separate canvas once campus zoom ≥ 0.3 |

## Prerequisite

`pnpm test` currently has one unrelated failure (`index.test.ts:66-69`, restroom fixture; see `docs/PERFORMANCE_REVIEW.md` P1). Fix it or record it as a known baseline before Phase 1, so new camera tests have a clean gate.

## Phases

Each phase is a separate PR, and each phase must leave the game playable. Phases 1 and 2 fix behaviour players can see. Phases 3–5 improve structure and polish.

### Phase 1 — Shortest-path avatar turning (bug)

- **Problem:** `lerp(avatar.rotation.y, target, blend)` does not wrap angles. `atan2` returns values in (-π, π]. When the target crosses ±π, the avatar spins almost 360° instead of turning a few degrees.
- **Change:** add `shortestAngleDelta(from, to)` (result in [-π, π]) and `lerpAngle(from, to, t)` to `packages/shared/src`. Use `lerpAngle` at `WorldCanvas.tsx:2727`, and also for pet/vehicle facing if they move to lerped rotation.
- **Tests (shared):**
  - Spec cases for `shortestAngleDelta`: 3.1 → -3.1 gives a small positive delta (≈ 0.083), 0 → π/2 gives +π/2, and the result is unaffected by multiples of 2π.
  - `lerpAngle(3.1, -3.1, 0.5)` stays near ±π, not near 0.
  - Revert check: the 3.1 → -3.1 case must fail against plain `lerp`.
- **Done when:** in the browser, walking left then right (facing across ±π) turns the avatar the short way.

### Phase 2 — FPP facing follows aim

- **Problem:** in FPP the server sets facing from movement intent only. Strafing turns the body sideways, other players never see a player turn while standing still, and leaving FPP aligns the camera to `player.rotation + π` (the last walk direction) instead of the look direction.
- **Change:**
  1. Shared: extend `MovementInput` with an optional `facingYaw?: number`. Validate it in `isValidMovementInput` (finite when present).
  2. Client (`OfficeApp.tsx:2039`): while in FPP, send `facingYaw` derived from `cameraYawRef` (`cameraYaw + π`, matching the `rotation + π` convention used for TPP alignment). Also send an input packet when only the look direction changed, respecting the existing 30 ms packet cap.
  3. Server (`OfficeRoom.ts`): when `facingYaw` is present, it sets `player.rotation`. Otherwise keep `atan2(intent)`. Seated and vehicle rules keep priority.
  4. Client FPP → TPP: align TPP yaw from the current FPP yaw, not from `player.rotation`.
- **Open question:** FPP state currently lives in `WorldCanvas`. `OfficeApp` needs it (or the facing yaw) to build the packet. Lift `firstPersonView` into a ref passed down like `cameraYawRef`, rather than adding a callback upward.
- **Tests:**
  - Shared: `isValidMovementInput` accepts a finite `facingYaw` and rejects `NaN`/`Infinity`/non-numbers.
  - Server: input with `facingYaw` sets rotation even when `x = z = 0`, and seated players ignore it.
- **Done when:** with two browser sessions, an FPP player strafing or looking around is seen facing the aim direction, and leaving FPP keeps the same view direction.

### Phase 3 — Explicit camera mode and a pure pose function (refactor)

- **Change:** add a new `packages/client/src/world/camera/` module containing:
  - `CameraMode = "tpp" | "fpp" | "free" | "map2d"` and a `cameraReducer(state, event)` for transitions (toggle FPP, manual drag, walk input, zoom past threshold, enter build/map edit, room change). This replaces the one-shot request flags and the inline `onClick` at `:3347`.
  - `computeCameraPose({ mode, target, yaw, pitch, elevation, distance, shoulderOffset })` → `{ position, lookAt, fov }`, pure and with no Three.js scene access (THREE math types are fine).
  - `WorldCanvas` reads the mode, calls `computeCameraPose`, and keeps only smoothing and `camera.lookAt`.
- **Behaviour:** none. This is a pure refactor.
- **Tests:**
  - Reducer transitions: walking from `free` returns to `tpp`, while `fpp`, `map2d` and edit modes do not auto-follow; FPP toggle off aligns behind.
  - Pose: TPP camera sits behind and above the target for a given yaw/elevation; FPP position is at eye height.
- **Done when:** existing manual flows behave identically. Check FPP toggle, orbit, pan, zoom into/out of 2D, build mode and room change.

### Phase 4 — TPP camera occlusion

- **Superseded on 12 October 2026:** immediate spring-arm compression caused an 8 m camera distance to drop to 3.7 m in one frame at a doorway. The owner chose stable zoom with transparent occluders. `cameraOcclusion.ts` now fades registered wall/door/prop visuals at fixed framing, with cached bounds and isolated materials; the spring arm and its tuning have been removed. The original design below is retained as history.
- **Doorway follow-up:** media-zone notifications also triggered arrival resets and snapped the pose. Zone changes within the same `activeRoomKey` now preserve camera state, pointer lock and pose smoothing. Actual world changes retain the arrival lifecycle. Regression tests cover zoom/elevation/frame preservation and FPP/free/2D/editor modes.
- **Problem:** the TPP camera can sit inside walls and props.
- **Change:** inside `computeCameraPose` or a thin wrapper, raycast from the look target to the desired camera position against walls and collision props. If it hits, pull the camera in to `hit distance − CAMERA_COLLISION_PADDING`, clamped to a minimum distance. Ease back out; snap in immediately.
- **Performance:** raycast against a prebuilt collider list, not `scene.children` recursively. Check frame time against `docs/PERFORMANCE_REVIEW.md` guidance.
- **Done when:** backing into a wall or a tight room keeps the avatar visible and the camera never shows the inside of geometry.

### Phase 5 — Named constants

- Move the camera numbers into `CAMERA` (shared) or the new camera module, with units in the names:
  - `TPP_FOV_DEG = 38`, `FPP_FOV_DEG = 68`
  - `FPP_EYE_HEIGHT = 1.42`, `LOOK_TARGET_HEIGHT = 0.95`
  - `SHOULDER_OFFSET = 0.68`, `POSITION_SMOOTHING_PER_FRAME = 0.92`
  - `TPP_ELEVATION_MIN_DEG = 8`, `TPP_ELEVATION_MAX_DEG = 68`
  - `FPP_PITCH_LIMIT_DEG`
- Resolve the FPP pitch inconsistency (±75° on drag vs ±78° under pointer lock) with one value.
- This can merge into Phase 3 if it is done in the same PR.

## Order and dependencies

```
Phase 1 ──┐
          ├──> Phase 3 (+5) ──> Phase 4
Phase 2 ──┘
```

Phases 1 and 2 are independent and small, so ship them first. Phase 4 depends on Phase 3, which gives one place to apply collision.

## Working rules

- Implementation: Codex (`gpt-6.1-sol`, `medium`). Claude reviews each diff.
- Every behaviour fix ships with a test that fails when the fix is reverted.
- Browser check for each phase. Use two sessions for Phase 2.

## Implementation notes — Phases 3, 5, 4 (2026-10-12)

Implemented in that order in the working tree, preserving the preceding session and facing work. No commits or branches were created.

- Phase 3: the reducer owns mode, follow/edit state, arrival lifecycle and framing values. First-person yaw remains in the OfficeApp-owned ref; leaving FPP preserves it, while a fresh arrival aligns once an avatar is available. Pure pose smoothing interpolates focus and spherical orbit coordinates. First frame, avatar arrival, mode/room changes and reduced motion snap.
- Phase 5: camera tunables have unit-bearing names. Both drag and pointer-lock pitch use 75°, assuming the requested conservative limit. Existing pose geometry, including its elevation formula, is preserved.
- Phase 4: TPP raycasts use static wall/prop proxies with layout coordinates, catalog heights and shared collision footprints. Door gaps and boundary footprints are shared with movement/rendering. Collision is applied after orbit smoothing to protect the displayed camera; inward correction snaps and outward distance recovers exponentially. FPP, free/edit and 2D views bypass the arm.

Assumptions: saved wall volumes and collision-prop footprints are conservative camera blockers; catalog heights describe their normalized visual height. Initial padding/minimum tuning is 0.2 m / 0.5 m. No runtime model-loading dependency is needed for these proxies.

Validation: the original smoothing code was confirmed on main by source inspection. Tests are registered for reducer transitions, pose geometry, convergence, frame-rate independence, snapping, orbit-radius preservation, pitch limits, spring-arm decisions, raycast exclusions, door gaps and shared wall/boundary geometry. Syntax/diff checks are local; the orchestrator must run build, tests and revert checks. Browser acceptance and frame-time profiling remain pending.

Browser acceptance:
- Phase 3: FPP toggle (including character focus while FPP), orbit, pan then walk, zoom into/out of 2D, build/map edit, room change, walking/driving target stability, fast orbit radius, reduced motion. Use two sessions to confirm the existing aim-facing contract still holds.
- Phase 5: drag and pointer-lock reach the same ±75° pitch; recheck FPP toggle, orbit, pan, zoom/2D, build mode and room arrival framing.
- Phase 4: back into a wall, orbit in a tight room, move past collision props and through a doorway; inward correction is immediate and outward recovery monotonic. Confirm FPP, 2D, free view and both editors bypass occlusion. Compare frame times at 1/10/25/50 players and increasing prop counts per PERFORMANCE_REVIEW.md.
