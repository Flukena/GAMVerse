# Microphone recovery and screen-share clarity

## Symptoms and scope

The owner reports that the microphone often fails to turn on and shared screens
are blurry. Preserve the ongoing structure refactor and private runtime state.
Investigate the actual capture/session/subscription paths before changing them.

## Reproduced microphone failure

On unchanged main `55d3c8a`, enable the microphone in room A, switch to room B,
then reject the next microphone capture with `NotReadableError`. The current
`VoiceRoomSession` discards the connected replacement room and starts transport
recovery, preventing receive-only use and leaving the microphone control disabled.
Capture errors must instead leave the authorized room connected and muted, show
useful guidance, and allow an explicit retry without reconnecting the room.

## Implementation and checks

- Client session owner: isolate microphone capture failures from transport/grant
  failures; retain generation guards, publishing policy and permission checks.
  Reproduce any additional microphone state race before including a fix.
- Screen-share owner: trace requested capture dimensions, content hints, encoding
  and selected receiver layer. Reproduce a clarity-relevant failure before choosing
  a focused capture/publishing/subscription correction.
- Add adjacent registered regression tests, observe failures before edits and
  verify controls fail when fixes are reverted. Keep realistic SDK seams.
- Verify build and all package tests against the recorded main baseline, plus
  independent review. Check two browser sessions with simulated media where
  possible; distinguish this from physical microphone/OS permission verification.
- Keep logs/captures and isolated runtime data under
  `/Volumes/ssd-fluke/BaseData/GAMVerse/media-recheck-20261022/`.
- Do not change production config, applied migrations, secrets or `.env` files.

## Confirmed causes and changes

- A recognized microphone capture failure during initial join or handoff now
  finishes the authorized join muted and connected instead of restarting the
  transport. Explicit retry clears the error on success. Native `AbortError` and
  `SecurityError` are included; SFU authorization and unknown failures retain
  their existing handling.
- Local microphone mute/unmute/unpublish events now reconcile the displayed
  session state. Remote participants and stale room generations cannot change it.
  A live microphone retained across proximity rotation keeps its user intent.
- The installed LiveKit SDK defaults to density 1 at DPR 2 when adaptive streaming
  is simply `true`: a 960×540 CSS viewer requests only 960×540 video. Setting
  `pixelDensity: "screen"` makes the same real SDK request 1920×1080. Sender
  capture, bitrate, frame rate and camera settings are unchanged.
- Six existing remote-viewer tests had outdated publication fakes without the
  SDK's desired-subscription methods. Updating that external seam restores them;
  a new test checks selected-screen/camera subscriptions, switching and idempotence.

## Verification — 22 October 2026

The relevant microphone suite passes 65 tests. Device capture and native-error
regressions failed before their fixes. The real-SDK screen-density test failed
at DPR 2 before its fix and passes both density cases afterwards. A separate
subscription mutation that subscribes every publication makes its new test fail.
Independent review found no remaining source findings.

Build passed after the final TypeScript check. Registered package results:

| Suite | Result |
| --- | --- |
| Shared | 99 passed, 3 unchanged failures |
| Client | 463 passed, 3 unchanged failures |
| Server | 340 passed, 9 unchanged failures, 1 existing skip |

Six baseline test failures are resolved by correcting the SDK test seam; the
remaining 15 failures match the previously recorded baseline. No new skip or
weakened gate was introduced.

Two isolated browser sessions used simulated devices against real API/realtime,
LiveKit and RAM-only PostgreSQL in an isolated hybrid local stack. Checks passed:

- Both users join the same meeting media room with connected WebRTC transports.
- A forced microphone capture failure shows guidance and preserves that same
  connection. One retry publishes audio; the receiver records incoming audio
  packets with zero concealed samples in the measured interval.
- Screen sharing starts, decodes remotely, expands to a measured 1920×1080 frame,
  renders the same publisher's camera PiP, and stops/restarts successfully.
  Simulcast still adapts resolution to view size and available conditions.

This used synthetic media rather than a physical microphone, real monitor text or
OS permission prompts. Stopping an outbound RTP track did not reproduce the SDK's
hardware-capture-ended event path; that recovery is covered at the SDK event seam,
not claimed as a browser hardware-unplug check. The hybrid loopback stack does not
verify production TLS, external-network bandwidth or TURN connectivity. Browser
captures, RTP summaries and red/green evidence remain in the external task directory.
