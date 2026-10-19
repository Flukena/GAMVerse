# Gather-style 2D mode plan

Status: implemented on feat/gather-2d (pending browser checks).

Goal: make 2D a full play mode with the core Gather Town features, while keeping 3D. The owner chose:
- a 2D/3D toggle that works anywhere on the campus, with walking and interaction in 2D;
- clean vector rendering drawn from the existing catalog (no new asset pack);
- text chat, emoji reactions and hand raise, interactive objects, spotlight, minimap and locate.

"Core" here means exactly that list, plus the features that already exist and must keep working in 2D: proximity, meeting and private-zone voice, camera, screen share, follow and wave.

Each phase is one PR and leaves the game playable. The server stays authoritative for positions, membership and media grants (`AGENTS.md` contracts).

## Prerequisite

`docs/MEDIA_SESSION_PLAN.md` Phase A, the client voice session that fixes the meeting A→B handoff at `OfficeApp.tsx:1308`, lands before Phase 1. Phase 4 builds on its `VoiceRoomSession`. Proximity group IDs keep rotating on membership changes (the media authorization boundary), so nothing here may rely on a stable group ID.

## Current state (verified 2026-10-14)

- **Where 2D is drawn.** The 2D overview is an inline block in `client/src/world/WorldCanvas.tsx:3168-3271`. It shows only on campus at `zoomRatio >= 0.3` (`camera/cameraState.ts:41`).
- **Projection.** It projects through the perspective 3D camera, so it is a tilted, orbitable view rather than true top-down. A dirty check skips idle redraws (`:3177-3200`), but any camera motion repaints every road, zone and player. Players are drawn at snapshot positions without smoothing (`:3252`).
- **Input.** The overlay has `pointerEvents: "none"` (`:814`). Picking and walking go through the hidden WebGL canvas and the perspective camera (`:974-980`, `:2284-2302`). Drag pans; there is no click-to-walk. Double-click auto-travel (`:2002-2014`) works.
- **What is drawn.** 2D draws floor, roads, zones and initial discs. It does not draw props, walls, doors or facing. `PROJECT_DOCS.md` calls the prop omission intentional; this plan reverses it.
- **Smoothing.** Avatar position smoothing is inline in `WorldCanvas.tsx:2810`. Only angle interpolation is shared.
- **Layout version.** `RoomLayout.version` is the format constant `1` (`shared/src/roomLayout.ts:26`), not a content revision.
- **Movement on the server.** `auto-move` accepts any in-bounds `{x, z}` and routes with A* (`OfficeRoom.ts:357-362`, `:1579`). `auto-move-to-player` exists (`:514`).
- **Props.** `RoomLayoutProp` has no metadata. `readRoomLayout` (`roomLayout.ts:986-999`) and `saveOfficeProps` (`repository.ts:57,72`) silently drop unknown keys. Props are writable by any office member (`repository.ts:52`).
- **Media.** One active voice room is selected (`OfficeApp.tsx:1272`). Leaving any room clears global camera state and all local tiles (`:820-852`), and tile keys omit the room (`:1075`).
- **Missing entirely.** There is no chat, reaction or hand-raise code. The latest migration is `021`.

## Phase 1a: 2D play mode (renderer, toggle, input)

**Camera state** (`world/camera/cameraState.ts`)
- Add `view: "3d" | "2d"` and a `toggle-2d` event.
- Mode resolution, in order:
  1. Editing gives `free`.
  2. FPP stays FPP. Toggling 2D from FPP leaves FPP first.
  3. `view === "2d"` gives `map2d`.
  4. On campus, `view === "3d"` past the zoom threshold also gives `map2d`. This keeps today's behaviour and `cameraState.test.ts:51`.
  5. Otherwise `tpp` or `free`.
- Toggling to 3D from `map2d` sets `view = "3d"` and resets zoom to the character focus, so rule 4 cannot keep the view in 2D.
- `view` survives `room-change` and `avatar-ready`. Only the user changes it.
- 2D follows the avatar until the user drags. In `map2d`, `walk-input` sets `following = true`, which is new; `cameraState.test.ts:30` is updated on purpose.
- 2D zoom is its own `map2dScalePxPerM`, clamped to named min/max constants.
- Toggle: a toolbar button plus M, handled once at window level. Match the camera-view shortcut guards: ignore repeats, paused gameplay and build/map-edit mode; never inside inputs or dialogs (including textareas, selects, contentEditable targets, ARIA dialogs and native dialogs). Canvas focus is not required.
- Persist the preference per device in `localStorage`, wrapped in try/catch.

**Renderer** (new `client/src/world/map2d/`, extracted from the god-file)
- `map2dProjection.ts` (pure): an orthographic affine (centre, `pxPerM`, viewport, device pixel ratio) with north fixed up, with `worldToScreen` and `screenToWorld`.
- `avatarPoseSmoother.ts` (pure, moved out of `WorldCanvas.tsx:2810`): the one position-and-yaw smoother used by both the 3D avatars and 2D. It is exponential smoothing toward the latest server pose, not patch interpolation. It exposes `isSettled` so the renderer knows when to stop redrawing.
- `map2dStaticLayer.ts`:
  - Draws floor, roads, zones, walls, doors and props into an offscreen canvas.
  - Props are rotated catalog footprints, filled with a colour per `group`, with glyphs for seats, vehicles and (from Phase 3b) interactive props.
  - Cache key: a content hash of the layout plus the props `configVersion`, plus a scale bucket. Not `RoomLayout.version`.
  - Each frame blits the visible source rect.
- `map2dDynamicLayer.ts`:
  - Draws avatars: a body disc in the character colour, a facing notch from the server `rotation`, a name pill, a status dot, a speaking ring and a "you" ring.
  - Redraws while the smoother is unsettled, when inputs or the view change, or when a timed decoration expires. Later phases register their decorations through one `Map2dDecoration` list with expiry times.
- `Map2dRenderer` class: owns the canvases, dirty state and disposal. `WorldCanvas` calls only `renderer.frame(state)`. WebGL rendering is skipped in 2D.

**Input in 2D**
- M toggles explicit 2D/3D. V retains the 3D TPP/FPP toggle and is ignored in explicit 2D.
- The overlay receives pointer events while in `map2d`. Every 2D pointer action goes through `map2dProjection`, never the 3D camera:
  - **click empty floor:** `onAutoMove({x, z}, randomVehicle=false)`, with a destination marker until `auto-move-status`;
  - **click a player:** the existing menu. Overlapping players are resolved by picking the nearest one within `MAP2D_PICK_RADIUS_PX`;
  - **drag:** pans. Drag versus click is decided by `MAP2D_DRAG_THRESHOLD_PX`;
  - **wheel:** zooms around the cursor;
  - **clicks outside the campus bounds:** ignored.
- WASD uses `screenMovementToWorld` with `MAP2D_SCREEN_YAW_RAD` (fixed north). No server change.

**Tests** (registered in `packages/client/package.json`):
- projection round-trip and DPR;
- every reducer precedence rule above, including toggling back to 3D while zoomed out;
- the smoother converges, and `isSettled` reports correctly;
- the static cache key changes when a prop moves;
- picking the nearest of overlapping players.

**Done when**:
- `pnpm build`, `pnpm test` and the server tests pass.
- Two browser sessions on Compose can toggle 2D anywhere, walk with WASD and click, see each other move smoothly with facing, click to open the player menu, and drag versus click correctly at DPR 1 and 2 after a resize.
- Proximity, meeting and private voice work while in 2D.
- Performance: 2D frame time at 1, 10, 25 and 50 simulated players, before and after. The target is p95 ≤ 16.7 ms on the dev machine. Captures go to `BaseData/gamverse/map2d-perf-<date>/`.

## Phase 1b: minimap and locate

- `Minimap` component (`client/src/ui/`) reuses the static layer bitmap at a small scale, with a dot per player. Click pans 2D. It is hidden in FPP and editors.
- People panel: "Go to" sends `auto-move-to-player`. "Locate" switches to 2D, pans to the target and pulses it for `LOCATE_PULSE_MS`.
- Tests: world↔minimap mapping; locate state transitions.
- Done when two sessions can locate and walk to each other from the People panel, and the minimap tracks movement.

## Phase 2: text chat

**Scopes.** `nearby` (the sender's server-resolved proximity group or media zone at send time; delivered live and not persisted), `office` (persisted), `dm` (persisted).

**Authorization**
- Identity always comes from the authenticated session, never from the payload.
- Every send checks that the sender and, for a DM, the target are current office members.
- DM history queries are always limited to the requester↔target pair inside one office. The cursor (`before=<id>`) is limited to that conversation, so a foreign ID returns nothing.

**Data and server**
- `shared/src/chat.ts`: types, `isValidChatSend` (scope, `CHAT_MAX_TEXT_CHARS`, DM target), `normalizeChatText`.
- Migration `022_office_chat_messages.sql`, registered in `infra/db.ts`. Table `app_office_chat_messages(id, office_id, scope, sender_username, recipient_username NULL, body, created_at)`, with indexes on `(office_id, scope, id)` and `(office_id, sender_username, recipient_username, id)`. Retention is `CHAT_RETENTION_PER_OFFICE` (10,000, one shared pool for office and DM messages; owner decision 1), pruned on insert.
- `server/src/offices/chat.ts` (`OfficeChat`, not inline in `OfficeRoom.onCreate`): validate, rate-limit per sender (`CHAT_MIN_INTERVAL_MS` plus a burst cap), resolve recipients from server state, persist, then deliver. An offline DM recipient sees it on next history load. A send that fails to persist is reported to the sender and not delivered.
- History: `GET /offices/:officeId/chat?scope=office|dm&with=<user>&before=<id>` on the API process, paged by `CHAT_PAGE_SIZE`.

**Client.** A "Chat" sidebar tab with Nearby, Office and DM threads, unread badges, and DM from the People row. Nearby messages show a bubble over the sender in 2D and 3D (`CHAT_BUBBLE_MS`, as a `Map2dDecoration`). Text only; never `innerHTML`.

**Tests**
- the validator;
- recipient resolution per scope (a pure function);
- the rate limiter;
- repository paging and retention;
- denial: a third member reading a DM, cross-office history, a foreign cursor, and a non-member send.

**Done when** two sessions exchange nearby, office and DM messages, a third session cannot read their DMs, history survives a reload, and spam is throttled.

## Phase 3a: reactions and hand raise

- **Reactions**
  - Message `reaction {emoji}`, validated against `REACTION_EMOJIS` in shared and throttled per sender (`REACTION_MIN_INTERVAL_MS`).
  - It is a transient broadcast with no schema field.
  - It floats over the avatar for `REACTION_FLOAT_MS` in 2D and 3D. Number keys send the quick set, only while the world has focus.
- **Hand raise**
  - Wiring end to end: a `PlayerState.handRaised` schema field (`shared/src/index.ts:285`), the client snapshot copy (`OfficeApp.tsx:2180`), the People signature (`:2203`), and a `hand-raise {raised}` message with a shared validator.
  - It clears only when that player's own media zone changes or they go offline. Other people joining or leaving their proximity group does not clear it. No SQL migration is needed.
- **Tests:** validators; throttle; hand-raise transitions (zone change clears it, a group-membership change does not); a late joiner sees an existing raised hand.

## Phase 3b: interactive objects

**Data**
- Optional `RoomLayoutProp.interaction`: `{ kind: "link" | "note" | "embed"; title: string; url?: string; text?: string }`.
- `isValidPropInteraction` in shared runs on the raw payload before normalization. An invalid value fails the save with an error; it is not dropped silently.
- One shared normalizer is used by both `readRoomLayout` and `saveOfficeProps`.
- It saves through the existing versioned props path; there is no new table.

**URLs**
- `https` only, with no credentials and no non-default port.
- Links: any `https` URL, opened in a new tab with `noopener,noreferrer`.
- Embeds: provider-specific. Each supported provider (YouTube, Google Docs/Slides, Figma, Miro, Excalidraw; owner decision 2) has a URL matcher and a canonical embed-URL converter. Anything else is stored as a link instead of an embed.
- The modal `iframe` uses the canonical URL with `sandbox="allow-scripts allow-same-origin allow-popups allow-forms"` and always shows an "Open in new tab" fallback for pages that refuse framing.
- "Whiteboard" is an Excalidraw or Miro embed; no native board.

**Editor and play**
- Editor: the Modify props panel gets an "Interaction" section, available to every office member (owner decision 3).
- Play: the nearest interactive prop within `INTERACT_RADIUS_M` is highlighted in 2D and 3D, with an "X to open" hint. Movement keys are suppressed while a modal is open, and focus returns to the world on close.

**Tests**
- validator: bad scheme, credentials, port, look-alike hosts such as `youtube.com.evil.test` and punycode;
- embed conversion for each provider;
- save rejection, load/save round-trip, a version conflict, and a stale map save that keeps interactions;
- the nearest-interactable picker.

## Phase 4: spotlight (security review before merge)

**Server**
- A shared `isValidSpotlightCommand` validator.
- `spotlight {targetUsername, on}` is accepted only from owners and admins. The role is re-read from the database on each command, not cached at join.
- Spotlight state (the set of usernames) is owned by the server and lives in room state.
- New realtime endpoint `/media/spotlight-token`. It always mints a subscribe-only token for current members. It mints a publish (mic and camera) token only if the requester is currently in the spotlight set, and re-checks after minting, like the proximity endpoint (`realtime.ts:112-128`).
- Revocation on spotlight-off, leave, kick or suspension, session replacement and office closure: `removeParticipant` with `revokeTokenTs`. The client then rejoins subscribe-only if still a member.

**Client**
- The spotlight room runs as a second `VoiceRoomSession` from `MEDIA_SESSION_PLAN.md`.
- Tracks and tiles are keyed per room, so leaving a zone room does not clear spotlight tiles or camera state.
- The spotlighted user must confirm before their mic or camera publish to the spotlight room.
- DND mutes spotlight playback.
- A user who is in the same zone room as the speaker does not play the speaker's zone audio track twice.

**UI.** A banner showing who is spotlighted; a "Spotlight" item in the People menu for owners and admins.

**Tests**
- the validator;
- non-admin rejection;
- a publish token is denied for a non-spotlighted user;
- the server removes the publisher participant within `SPOTLIGHT_REVOKE_DEADLINE_MS` of spotlight-off, measured against LiveKit;
- a replayed old publisher token is rejected after revocation;
- zone transitions keep the spotlight audio.

## Owner decisions (2026-10-14)

1. Chat retention: `CHAT_RETENTION_PER_OFFICE = 10_000` messages per office. Office messages and DMs share one pool. This was assumed from the single number given; split the pool if the owner wants separate limits.
2. Embed provider allowlist: YouTube, Google Docs/Slides, Figma, Miro, Excalidraw.
3. Any office member can attach or edit prop interactions, matching today's prop permission (`repository.ts:52`). Because any member can publish a link others will click, link safety rests on the validator, `noopener,noreferrer` and the provider-only embed rule. The open action shows the destination hostname before navigating.
4. Spotlight: admin. Owners are included, since the owner role is a superset of admin. Meeting hosts are not.

## Visual detail pass (2026-10-15)

Single visual pass requested by the owner: bring the existing 2D play map closer to the furnished-office detail of Gather 2.0. Keep the established vector approach and existing licensed catalog; no new asset packs.

- Draw warm staggered floorboards in meeting/common areas, muted carpet in private workspaces, tiled restrooms, subtle outdoor texture and road edges. Suppress fine patterns at minimap scale and keep them in the existing static bitmap cache.
- Replace generic colored prop blocks with recognizable top-down furniture and foliage: desks/tables, seats/sofas, monitors, cabinets, plants and trees. Preserve each saved footprint and rotation; retain catalog previews for unsupported assets.
- Give walls a light cap/baseboard and shallow shadow; preserve door/opening positions and avoid drawing detail across the doorway.
- Polish avatar/name contrast with soft shadows and readable dark name pills while retaining selected head portraits, facing, status, speaking and local-player indicators.
- Keep world positions, movement, collision, room membership, media, picking and 3D behavior unchanged.

Validation: registered contract tests for visual classification and detail scaling, existing client/shared tests, `pnpm build`, independent review, and browser-rendered representative rooms at play/minimap scales. Record any unavailable authenticated or two-session Compose checks explicitly. Browser fixtures and build/test output live on the mounted BaseData volume.

Implemented with focused surface, wall and prop modules; no map data or 3D changes. New surface/prop contracts were run RED before implementation and GREEN afterwards. The doorway-shadow regression was reproduced before its fix and passes at 2 and 12 px/m afterwards. Client tests pass 136/136. The root test command stops at the existing shared `propInteraction.test.ts:19` URL-validation failure (49/50 shared tests pass; shared source is unchanged from HEAD).

Safari checks use the real 2D renderer in an isolated fixture: furnished rooms at 12 and 24 px/m, static detail suppression at 2 px/m, generated campus, portrait and unsupported-prop preview loading, interaction badge, and click-to-walk intent. Authenticated gameplay and two-session movement/media checks were not run because of the local HTTPS connection/certificate issue. Independent review findings about doorway shadows, wall-function complexity and plan/material consistency were corrected and re-reviewed.

## Full-body 2D characters (2026-10-19)

Single focused visual update requested by the owner: show the selected character walking in 2D and let it grow and shrink naturally with zoom. Reuse the existing selected model assets, idle snapshot queue, distance-driven motion state and server-owned yaw. Cache eight-direction atlases with eight walking poses plus idle/seated poses; use built-in clips or the existing procedural humanoid rig. Keep a full-body fallback during loading and bound atlas retention. Character drawing, indicators, label clearance and selection follow the same unclamped world projection; name text stays readable in screen pixels. Use a 1.6 m model in a 2.1 m frame, a 1.6 m full stride and at most 1.5 walking cycles per second; bound cached and pending atlas canvases to 32 MiB. No movement, collision, media or 3D changes.

Validation: run zoom-scaling and paced-gait regressions RED against the previous fixed-size/fast-gait implementation, then run registered sprite selection, drawing, picking, label and cache-budget tests plus the workspace build/test gates. Record unavailable authenticated or multiplayer browser checks explicitly.

## Routing

Plan by Claude (opus), reviewed by Codex `gpt-6.1-sol` `medium`. Implementation is Codex `medium`, one run per phase. Claude reviews each diff. Phases 2 and 4 also get an authorization-focused review. Every phase report lists the shared, client and server test commands it ran, the test-fails-on-revert evidence, and which multiplayer browser checks were and were not run.

## Owner UX updates — 2026-10-15

3D wheel and toolbar zoom stays in 3D at the existing distance limit; mode controls or M switch 2D/3D explicitly. Workspace colors reuse the GAMVerse navy/cyan/sky/yellow theme, including light/dark and a navy light-theme focus outline. Automatic participation defaults to Join for server-confirmed conversations; explicit Listen/Off, availability suppression and private-admission muting remain. Talk and AV shortcuts are removed from the dock and available through Account and settings → Settings → General.

Verification: complete build and 335 registered client tests passed. Camera regression tests failed before the change, then passed; automatic-join regressions also failed before the change. Two production browser profiles formed a Nearby conversation by real server-routed walking and selected Join automatically with microphone off; manual Off remained selected. Normal pointer clicks switched 3D ↔ 2D, maximum zoom remained in 3D, Light/Dark were visually inspected, and Settings opened both destinations with Enter and closed before each. AV dialog fit a 390 px viewport without horizontal overflow and Escape closed it. Independent Sol review cleared camera, palette, automatic join and Settings; no Astra was used.
