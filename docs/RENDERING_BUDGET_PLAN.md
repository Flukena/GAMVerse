# Rendering budget plan

## Goal

Reduce browser rendering and animation work when scene content cannot be seen, while preserving the current authoritative multiplayer state and camera behavior.

## Phase 1 — Suspend invisible view work

- Keep the minimap near 30 FPS, never above 60 FPS.
- Stop minimap drawing when it is hidden, outside the viewport, or the browser tab is inactive.
- Suspend the world animation frame loop while the browser tab is inactive, then reset frame timing and resume when visible.
- Confirm map movement and camera state recover on return without a large animation delta.

## Phase 2 — Profile scene culling and quality tiers

- Record draw calls, shadow pass cost, frame time, and object counts on representative maps and devices.
- Preserve Three.js frustum culling for static meshes and identify any assets that disable it.
- Evaluate distance-based shadow caster limits, avatar animation culling, and dynamic pixel-ratio tiers against the profile.
- Add a change only when it removes measured work without hiding visible objects or causing shadow/camera artifacts.

## Verification boundary

The browser must be checked with the tab active/inactive and with representative dense maps. Automated checks cover scheduling logic where it can be kept independent of the Three.js scene.
