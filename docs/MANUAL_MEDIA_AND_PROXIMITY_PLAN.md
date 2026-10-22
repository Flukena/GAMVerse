# Manual microphone intent, status presentation and proximity stability

## Contract

- The microphone button owns the user's desired on/off choice. A session gap,
  reconnect, availability change or capture failure must not replace that choice.
  Default to off for a fresh sign-in; keep the choice within the signed-in app.
  Leaving a room stops actual capture/publication, while the choice can survive
  until the user changes it. Sign-out ends capture and resets the next sign-in.
- Actual publishing still requires a current authorized, publish-capable room
  and successful device capture. Listen-only grants remain receive-only, and
  moderation/revocation boundaries remain enforced. Show chosen intent and
  connection/capture failure distinctly so the button remains usable while
  reconnecting or outside a voice room.
- Availability is presented consistently through icon, color and text using the
  existing project design and neutral presence-presentation mapping. It does not
  silently change microphone intent. Preserve saving, expiry and error handling.
- Use one shared 50-world-unit (50 m / placement-block) proximity radius in both
  default and campus worlds. Preserve current attenuation and full-volume policy.
- A proximity room may survive additions only if every previous member remains
  authorized in the new component. Any removed member still requires a fresh
  incarnation and retirement of old bindings; old JWTs must not regain access.

## Reproductions before editing

- On `99ae762`, choosing Mic on before a target exists is discarded; temporary
  capture failure and availability suppression also erase the user's choice.
- On actual `origin/main` OfficeRoom source, adding a 25th nearby person moves
  all 24 existing members to a fresh media room and schedules their removal.
  Delayed cleanup did not hit the final active incarnation in the reproduced
  scenario; unnecessary membership-addition churn is the confirmed cause.
- General world proximity is 20, but the campus world actually uses 7.

## Ownership and verification

- Client media: separate desired mute intent from actual publication state;
  preserve stale-generation/event guards and listen-only restrictions. Tests
  cover no target, handoff, reconnect, capture failure and explicit user changes.
- Server/shared: extract focused proximity grouping, retain safe additions,
  preserve revocation on shrink/split and test delayed cleanup under many users.
  Test distances around the shared 50-unit boundary.
- Status UI: reuse the neutral presentation map for accessible icon/color/text
  selection and existing person/status displays; no world-to-UI dependency.
- Coordinator: update OfficeApp wiring, mic-control availability, status policy
  text and documentation; preserve explicit deafen and moderation semantics.
- Run build, registered suites and independent review, with fail-before-fix
  evidence. Exercise multiple browser sessions joining/leaving proximity and
  manual microphone selection across reconnects where possible.
- Store logs/captures/runtime data only under
  `/Volumes/ssd-fluke/BaseData/GAMVerse/manual-mic-proximity-20261022/`.
  Preserve private `.devmode.json`; no production config, secrets or migrations.

## Completed verification

- Final production build passed with pinned pnpm 11.25.0 in the external
  dependency-complete verification workspace. Package source and manifests were
  compared with the working tree; private runtime configuration was excluded.
- Registered suites: shared 101/104 passed, client 484/487 passed, server
  346/356 passed with one existing skip. The 15 failures match the prior
  baseline; no new failures or skipped tests were introduced.
- Negative controls failed before restoration: microphone selection without a
  target, capture failure and queued On/Off; proximity addition churn on actual
  `origin/main` OfficeRoom source; removal/split security guards; status picker
  rendering; spotlight consent recursion; explicit deafen; LiveKit's stored-zero
  gain reset on audio attachment; microphone presentation and playback gain.
- Three independent Chromium browser contexts on the isolated Docker PostgreSQL/LiveKit
  plus host API/realtime/Vite stack verified live audio transmission. The manual
  On choice survived a 2→1→2 session gap and resumed publication. Busy, Away and
  Available preserved the choice and existing connection. A third participant
  joined without replacing the first participant's active media connection;
  departure rotated that room and restored authorized publication.
- Deafen muted existing and newly arriving audio tracks through real WebAudio
  gain nodes (both gains reached zero). Undeafen restored both gains and incoming
  audio counters confirmed reception on both tracks. Microphone publication remained selected.
- Desktop and 390 CSS-pixel status layouts were captured and inspected. Native
  radio arrow navigation and Escape restore trigger focus. Actual pending-save
  blur and controlled delayed-save fixtures reproduced focus regressions before
  their fixes; final checks cover stale completions, menu reopen, failed saves
  and successful saves after disabled-radio blur.
- Independent source review has no open findings. No Sonar service scan was run.
  The local Compose HTTPS path, physical microphone/speaker devices, external
  TURN reachability and a real 25-person browser load were not tested. The
  crowded-group regression uses the actual room implementation with 25 players.
- Evidence is under the external task directory above. The temporary runtime
  and browser were stopped after verification. This change does not deploy.
