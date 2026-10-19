# Gather-style office UX refactor

Date: 2026-10-15

The office should make finding a colleague, starting a conversation, and navigating the map immediately discoverable. This is one playable client-only delivery, following the 2D visual detail pass.

Reference: [Gather 2 getting started](https://support.help.gather.town/articles/1982412443-getting-started-guide) and [office overview](https://support.help.gather.town/articles/6691595739-office-overview). Use the persistent navigation, focused panels, contextual people actions, and accessible map controls as interaction references. Keep GAMVerse branding and its existing server-authoritative movement and media contracts.

## Implementation

1. Extract a persistent compact navigation rail and panel header from OfficeApp. Office, People, Chat and Activity each open a focused panel; clicking the active item closes it. Display the current office and connection state. Keep account settings accessible and maintain responsive map space.
2. Extract the people panel into a focused module. Search display names and usernames once, group nearby/office/reconnecting people, and reveal actions on selection instead of putting every button in every row. Preserve message, go to, locate, follow, wave and authorized spotlight actions. Describe the user's actual presence rather than claiming they are always at their desk.
3. Separate chat presentation from transport/state. Give Nearby, Office and direct conversations clear labels, unread badges, empty states and message metadata. Keep a visible composer, sensible scrolling and disconnected feedback; use the existing chat API and messages only.
4. Make existing 2D navigation controls discoverable (zoom, recenter, desk and view selection), using focused components instead of adding logic to WorldCanvas. Keep existing click-to-walk and drag-to-pan contracts.

## Checks

- Build all packages with `pnpm build` and run affected client tests.
- Independently review component boundaries, accessibility, disabled/reconnecting states, and preservation of existing actions.
- Browser-check rail switching/collapse, people filtering/actions, chat selection/composer and desktop/narrow layouts using real components. Validate the full authenticated Compose flow where available; disclose any local TLS or login blocker.
- No server or persistence changes, dependency additions, new asset packs, or production deployment.

## Delivery verification (2026-10-15)

- Full `pnpm build` passed; client tests passed 141/141. New directory/chat helpers were checked RED before implementation, then GREEN.
- Independent review findings were reproduced and resolved: long people lists now scroll within the panel; reconnecting people remain messageable; the new-DM popover closes and focuses the composer; guide labels match controls; automatic map2d overview receives the 2D toolbar.
- Safari checked the actual components with a local fixture at desktop and 390-pixel viewport widths: rail switching/collapse, 32-person list scrolling, contextual actions, reconnecting-member DM, repeated same-person DM selection, remembered threads, Enter/Shift+Enter, rendered sent messages, disconnected retained draft/disabled send, map zoom/recenter and hand raise. Transport and room data in this fixture are synthetic.
- The automatic-overview toolbar event mapping was inspected against the camera reducer; a full authenticated world check is still outstanding. No two-player/media check was completed because local browser TLS access remains blocked. The earlier shared-test baseline still has one unrelated prop-interaction validator failure; no shared code was changed by this UX pass.
- Evidence lives under `/Volumes/ssd-fluke/BaseData/GAMVerse/gather-ux-20261015/`. The larger feature roadmap is [GATHER_V2_PARITY_MASTER_PLAN.md](GATHER_V2_PARITY_MASTER_PLAN.md).
