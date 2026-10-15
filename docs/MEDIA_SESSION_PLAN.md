# Media session stability plan ("Client initiated disconnect")

Status: Phases A and B are implemented in the current worktree; this document preserves their design rationale. The verified root causes below describe the starting state on 2026-10-14, not the current implementation. Two-session Compose verification remains outstanding.

Current implementation: `VoiceRoomSession` handles target changes, retries, suspend/resume, and media policy in `packages/client/src/ui/media/voiceRoomSession.ts`. Zone exit hysteresis lives in `packages/shared/src/zoneMembership.ts`; exact-membership proximity room reuse and fresh room incarnations live in `packages/server/src/offices/OfficeRoom.ts`. The 2026-10-15 review also scopes queued media controls to the room generation to prevent a pending permission prompt from blocking a replacement room.

## Problem

Users see the alert "Client initiated disconnect" and lose voice. Some stay without media until they walk into a different zone.

Evidence comes from the dev stack over 48 h (`~/basedata/gamverse/client-initiated-disconnect-20261014/`, Codex report `codex-final.md`):
- There were 805 LiveKit participant closings by server removal: 620 proximity, 166 meeting and 19 private.
- 665 of them (82.6%) were followed by a join for the same identity within 5 s.
- LiveKit SDK 2.22.3 rejects a pending `connect()` with `ConnectionError` reason `Cancelled` ("Client initiated disconnect") when `disconnect()` is called mid-connect (SDK `Room.ts:1105`).

## Root causes (verified on `main` `f071625`, 2026-10-14)

1. **Our own cancellations surface as errors.** The leave helpers (`OfficeApp.tsx:820-852`) disconnect rooms whose `connect()` may still be pending. The join `catch` blocks (`:1031`, `:1090`, `:1147`) pass that SDK error to `setVoiceError`, and the alert renders at `:3022`. The stale-target early returns are silent; only cancellations that land mid-connect show the alert.
2. **Moving from meeting A to meeting B leaves the user without media.** The meeting effect depends on `[appPaused, meetingZoneActive]` (`:1300-1308`), so A→B never joins B. `joinMeetingVoice` reads `meetingZoneId` from its render closure (`:1111`). Meanwhile the server revokes A (`OfficeRoom.ts:1003`).
3. **Disconnects are never recovered.** The `Disconnected` handlers (`:1016`, `:1079`, `:1136`) only clear state. The private and meeting handlers can also clear the state of a newer room. Leaving during the media reset (`:1087-1089`, `:1144-1146`) can mark a dead room connected.
4. **Proximity rooms rotate on every membership change.** The group ID is the hash of all members (`OfficeRoom.ts:1097`). This rotation is currently the **only** thing that removes a departed member's access: self-hosted LiveKit `v1.13.7` (`compose.yaml:3`) does not enforce `revokeTokenTs` (it is LiveKit Cloud-only), so `removeParticipant` disconnects a user but does not stop an unexpired token from rejoining. **The rotation stays.** This plan reduces its cost instead of removing it.
5. **Zone edges can flap.** `roomLayoutZoneAt` (`shared/src/index.ts:255`) has no exit margin. This is plausible from the code but not proven by the logs.

The three join functions are near-copies of each other, and the meeting copy is the one that missed the zone-ID check.

## Phase A: client voice session (one PR)

New `client/src/ui/media/`:

**`voiceTarget.ts` (pure)**
- `resolveVoiceTarget({ officeId, sessionKey, paused, meetingZoneId, privateZoneId, proximityGroupId })` returns `{ kind, id, officeId, sessionKey } | null`. Priority: meeting, then private, then proximity; `paused` gives null.
- `voiceTargetKey` returns a stable string for a target.

**`VoiceRoomSession` class**

One controller for all three kinds, replacing the three copies. Its contract:
- **Synchronous invalidation.** `setTarget`, `leave` and `dispose` bump a generation number before any `await`. Every continuation (after the fetch, `connect`, media reset and media controls), plus every event handler, `catch` and `finally`, checks both the generation and the room's identity before touching state. A handler for room X never clears the state of room Y.
- **Coalescing and ordering.** Setting the same target key again is a no-op. A stale token fetch is cancelled with an `AbortController`. Teardown is serialized: the old room has fully disconnected before the new join starts. There is only ever one room per session.
- **Error classification by SDK type, not message text.**
  - A `ConnectionError` with reason `Cancelled`, or a `DisconnectReason.CLIENT_INITIATED`, is suppressed only if this session caused it (generation mismatch, or a pending leave that this session started).
  - A failure on the current target is always reported.
  - The token endpoint's HTTP status is kept on the error.
- **Recovery.**
  - An unexpected disconnect, an initial fetch failure or a connect failure on the current target retries with backoff: `VOICE_RETRY_BASE_MS`, `VOICE_RETRY_MAX_DELAY_MS`, and `VOICE_RETRY_MAX_ATTEMPTS` counted across all failure kinds. Each retry fetches a fresh token, because TTLs are 5 minutes for meetings and 1 minute for private and proximity rooms (`service.ts:44,62,74`).
  - The session does not retry while the SDK is reconnecting (`Reconnecting`), and only acts after `Disconnected`.
  - A 401/403 stops retrying for that generation. This includes the proximity group-change 403 at `realtime.ts:123-124`. A new authoritative target from the server starts afresh.
  - When attempts run out, a "Reconnect voice" button appears instead of a disabled mic (`:2944`).
- **Lifecycle.**
  - Browser `freeze`/`pagehide` or a realtime transport drop *suspends* the session: no retries run.
  - `resume`/`pageshow` or a realtime reconnect *revalidates*: the current target is re-read from spatial state (`OfficeApp.tsx:2420-2426`).
  - Sign-out, leaving the office and terminal leave codes (4000/4001/4004, `officeReconnection.ts:47-48`) call `dispose`.
- **Media policy (decided).**
  - Joins and recoveries are receive-only, the same as today's `resetLocalMediaForVoiceRoom` (`:924-932`).
  - The mic's *muted* intent is kept across a switch or recovery: if the user was unmuted, the mic is republished in the new room.
  - Camera and screen share are not republished automatically. The user is told they stopped, because screen share needs fresh consent.
  - Controls that race with a recovery are queued until the session is connected, or dropped if the generation changes.
- **Reporting up.** State is reported through a listener interface that `VoiceRoomSession` owns (connected, muted, busy, error, tracks), so `OfficeApp` subscribes and nothing calls upward.

`OfficeApp` keeps one effect: `session.setTarget(resolveVoiceTarget(...))`, keyed by primitive inputs including `meetingZoneId`.

**Regression tests.** These must fail on current `main` (fake LiveKit room at the SDK seam; the session is never mocked):
- meeting A→B joins B;
- our own cancellation during `connect` does not set an error;
- an unexpected disconnect recovers with a fresh token;
- a leave during media reset does not end up connected;
- an old room's `Disconnected` does not clear a newer room's state.

**Preservation tests.** These already pass on `main` and must keep passing:
- paused leaves all rooms;
- a 403 does not retry;
- stale private/proximity targets are ignored.

**Also test** the retry cap and backoff, suspend/resume, and a mute intent kept across a switch. Register all of these in `packages/client/package.json`. Each implementation report shows the pre-fix failure output of the regression tests.

## Phase B: server churn without weakening authorization (one PR)

- **Zone exit hysteresis.** `roomLayoutZoneAt(position, config, previousZoneId?)` keeps the previous zone while the player stays within `ZONE_EXIT_MARGIN_M` of it, with these rules:
  - The zone must still exist in the current layout.
  - A smaller zone the player is *fully inside* (not within the margin) still wins, the same as today.
  - Hysteresis only ever keeps membership the player already had; it never grants a new zone. So a locked destination (`OfficeRoom.ts:1293-1296`) cannot be entered through it.

  Tests: entering, crossing the margin, nested zones, adjacent zones, corners, a removed zone, and a locked zone.
- **Proximity rotation stays.** The group-hash rotation is the authorization mechanism, so this PR does not change it. Its cost is reduced only by:
  - the hysteresis above;
  - Phase A's quiet, automatic switching.
- **Document the boundary.** `PROJECT_DOCS.md` notes that self-hosted LiveKit does not enforce `revokeTokenTs`, and that a departed member's access ends through room rotation plus the 1 minute token TTL.
- **Measure.** Count proximity group changes per minute in a scripted walk, before and after.

## Verification

- **From logs:** service removals per hour and the 5 s removal→rejoin ratio, measured before and after with the same script on the same scenario. Captures go to `BaseData/gamverse/media-session-<date>/`.
- **Two or three browser sessions on Compose:**
  - meeting A → B;
  - standing in a doorway;
  - a group of 3 joined by a 4th;
  - a tab freeze and resume;
  - DND then Available;
  - a realtime drop and reconnect;
  - sign-out.

  After each step there should be no cancellation alert, voice should be connected, and the mute state kept.
- **Commands:** `pnpm build`, `pnpm test`, and `pnpm --filter @gammyverse/server test`. Report new failures separately from the known baseline.
- **Docs:** update `README.md` and the current section of `PROJECT_DOCS.md` for the recovery behaviour.

## Open question for the owner

Enforceable mid-session revocation on self-hosted LiveKit would need either LiveKit Cloud or a join webhook that rejects participants the realtime server no longer authorizes. It is out of scope here. Say if you want it planned.

## Routing

Plan by Claude (opus), reviewed by Codex `gpt-6.1-sol` `medium`. Implementation is Codex `medium`, one run per phase. Claude reviews each diff. Phase B's review explicitly checks that the authorization boundary has not weakened.
