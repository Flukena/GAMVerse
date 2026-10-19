# Person details and walking sounds

Deliver one focused follow-up to MR #20.

- Present person details as a styled, nonmodal panel. Opening or closing it preserves held movement and automatic travel; typing fields and genuinely modal dialogs keep their existing input protection.
- Preserve the current person actions, online/status information and keyboard dismissal. Keep the panel usable on narrow screens without blocking the whole world.
- Play soft local footsteps from actual displacement in both 2D and 3D. Idle, seated, vehicle, paused, hidden and disconnected states remain silent; teleports do not produce a burst of steps.
- Reuse the existing world frame loop, bound cadence and audio resources, unlock browser audio from a user gesture, and provide a sound preference without adding third-party assets.
- Footsteps use original short block-style impacts with dry grit/crunch and small per-step variations. Generate PCM variants once per audio context and reuse them during walking.

Verification: reproduce the current person-details movement pause before the fix; registered regression tests for panel/input behavior and footstep cadence/lifecycle, full build, independent review, and browser checks when local certificate access permits them.
