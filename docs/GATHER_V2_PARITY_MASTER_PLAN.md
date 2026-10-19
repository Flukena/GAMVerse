# Gather v2 parity master plan

Date: 2026-10-15
Status: progressive implementation through P01–P08/P11–P17, with bounded scope and evidence below. The current final batch covers visible P10 desk administration and furnished new-office creation. On 15 October the owner directed completion of this visible deliverable followed by a rebase onto main; further roadmap implementation is paused at that scope boundary. P09, full team seating and later phases remain open, as does complete reference parity acceptance.

## Outcome and working assumptions

Make GAMVerse behave and feel as close to Gather v2 as practical across the full virtual-office workflow: enter the office, find people, approach or invite them, hold a private or public conversation, collaborate, and return to focused work. Match interaction states and failure paths as carefully as the appearance.

The target is Gather **v2**, using the official documentation snapshot below. Keep GAMVerse identity and create or use appropriately licensed art. The existing React, Canvas 2D, Three.js, Colyseus, PostgreSQL and LiveKit stack remains the starting point. New offices should eventually start in 2D; keep 3D as an optional GAMVerse view and preserve saved preferences.

Desktop browser is the first delivery surface. Compact browser layouts remain usable throughout. Native Mini Mode, OS app detection and a calendar extension are separate deliverables because a browser cannot provide all desktop capabilities. Mobile native apps, billing parity, Outlook, Slack and screen annotations are outside this v2 baseline unless new evidence or product direction adds them.

Success has three dimensions:

- **Visual:** hierarchy, panel/dock placement, spacing, avatars, office presentation and conversation cues match the reference flow.
- **Interaction:** actions take the expected number of steps, keyboard and pointer flows agree, and loading/empty/reconnecting/denied states are explicit.
- **System behavior:** conversations, read state, desk ownership, media access and notifications survive real multiplayer use and reconnects.

Do not describe feature presence as parity until its acceptance flow passes. No percentage estimate is assigned before the reference journeys are measured.

## Verified reference baseline

References were checked on 2026-10-15. Article dates differ; prefer the newer feature-specific article when they conflict. These are documented capabilities, not a claim that we exercised every feature inside a signed-in Gather account.

| Reference | Target capability |
| --- | --- |
| [Getting started](https://support.help.gather.town/articles/1982412443-getting-started-guide) | Persistent navigation, person actions, command search, office movement, availability and conversation entry |
| [Office overview](https://support.help.gather.town/articles/6691595739-office-overview) | Open/private/hybrid layouts, themes and office sizing |
| [Desk overview](https://support.help.gather.town/articles/5621269913-desk-overview) | Claim, return, decorate and reassign desks; open/private desk conversation defaults |
| [Meeting overview](https://support.help.gather.town/articles/4462418552-meeting-overview) | Office/Meeting views, simultaneous screen shares, meeting links, invitations and locks |
| [Audio settings](https://support.help.gather.town/articles/7105169617-audio-settings) | Device selection, noise/echo controls, nearby listening preferences and mute behavior |
| [Chat overview](https://support.help.gather.town/articles/6847600389-chat-overview) | Persistent channels/DMs/groups/threads, rich messages/search; separate temporary meeting and nearby chat |
| [Status and availability](https://support.help.gather.town/articles/9785009882-status-availability) | Custom status, calendar-driven status and optional desktop app activity |
| [Google Calendar](https://support.help.gather.town/articles/4056265393-google-calendar-chrome-extension) | Agenda, reminders, correct-room joining and scheduling extension |
| [Guests](https://support.help.gather.town/articles/4769581716-managing-guests) | Host check-in, limited guest access and meeting entry |
| [Roles](https://support.help.gather.town/articles/3935502038-user-roles-permissions) | Member/admin/guest boundaries |
| [Studio](https://support.help.gather.town/articles/1963307749-studio-overview) | Office layout editing; inspect detailed editing states in phase P00 |
| [Coworking](https://support.help.gather.town/articles/2613002568-coworking) | Freeform, focused and timed focus/break sessions |
| [Whiteboards](https://support.help.gather.town/articles/9576297537-whiteboards) | Shared embedded whiteboard object; provider owns collaboration/storage |
| [Interactive objects](https://support.help.gather.town/articles/5512361772-interactive-objects) | Embedded tools/games and shared celebration objects |
| [Recording and AI notes](https://support.help.gather.town/articles/4822083973-meeting-recording-notes) | Video recording, transcripts, summaries and access-scoped meeting artifacts |
| [Mini Mode](https://support.help.gather.town/articles/7080664654-mini-mode) | Compact presence/conversation window with AV and status actions |
| [GitHub](https://support.help.gather.town/articles/9227624559-github-integration), [Spotify](https://support.help.gather.town/articles/1248816989-spotify-integration) | PR activity on profiles/map and optional listening activity |
| [Smart Objects](https://support.help.gather.town/articles/1914828565-smart-objects?lang=en) | Signed webhook updates to office objects and an activity feed |
| [SSO](https://support.help.gather.town/articles/5381966259-sso) | SAML/OIDC SSO, documented as beta on September 18, 2026 |
| [v1/v2 comparison](https://support.help.gather.town/articles/3747344661-gather-1-0-vs-gather-2-0) | Additional inventory: AI search, dark mode, desktop menu-bar presence and exclusions |

The comparison page dated September 4 says SSO is not ready, while the September 18 SSO article documents beta support. Plan SSO as an advanced beta-parity feature. The same comparison recommends up to 100 people for v2; that is a reference recommendation, **not** a measured GAMVerse capacity. AI Search details and exact shortcut precedence still need a signed-in reference check.

## Current code baseline and gaps

This is based on current source, including the in-progress UX delivery. Historical “current state” sections in older plans must not be copied as today's baseline.

| Area | GAMVerse today | Remaining target |
| --- | --- | --- |
| Shell | Persistent rail/header, main menu/office switcher, command palette, scoped Light/Dark/System and native dialog focus policy | Migrate remaining legacy overlays; complete authenticated reference/focus matrix |
| People | Online/offline directory, shared map/list cards and message/go-to/locate/follow/wave/spotlight actions | Instant meeting request lifecycle and richer offline profile fields |
| 2D world | Pan/zoom/click, Simplified/Immersive/Auto, surfaces/props, portraits, room labels, recenter/desk controls and route feedback | Conversation clusters/occupancy; P06 avatar and dense-label acceptance underway |
| Presence | Seven explicit statuses including Away; shared suppression policy, office-persisted custom text/emoji/expiry | Optional idle/calendar smart status and full media acceptance |
| Desks | One claimed private **zone** per member | Stable desk entity, open/private desks, personal objects/settings, admin desk manager/team seating |
| Conversations | Spatial meeting/private zones and connected proximity groups | Stable conversation identity, listen/join/mute, invitation acceptance, lock/knock/admit, explicit lifecycle |
| Meetings | Video track tiles, focus popup, AV/share buttons | Participant-first Office/Meeting views, camera-off tiles, stage/pins, multiple shares, device controls, meeting chat |
| Chat | Nearby/office/DM, history, local unread, improved composer | Server inbox/read cursor, groups/channels, thread replies, mentions, attachments, search, delivery states |
| Notifications | Wave/follow alerts and chat badge; office audit feed | Personal actionable inbox, durable read state, notification preferences and delivery policy |
| Rooms/editor | Generated layout, zones/doors/locks, separate map/prop drafts | Team areas/room metadata, templates, room resize/move, undo/redo, scoped decoration ownership |
| Objects | Note/link/allowlisted iframe interactions | Object presets, shared object state, webhook objects, embedded collaboration affordances |
| Calendar | No provider integration found | OAuth connection, agenda/reminders, bookings, room links, extension and smart status |
| Guests/admin | Account membership, owner/admin/user/maintainer, invites | Host check-in, expiring guest identity/grants, guest limitations, office policies and SSO |
| Recording/AI | No implementation found | Egress/storage, permissioned artifacts, transcript jobs, grounded notes and search |
| Desktop/integrations | Browser application | Mini Mode fallback/native wrapper, OS presence, GitHub/Spotify, native notifications |

Important implementation facts:

- `ui/OfficeApp.tsx` remains the coordinator for account, office, panels and media. New `ui/workspace/`, `social/ChatPanelView.tsx` and `world/WorldControls.tsx` reduce UI in the coordinator but do not complete the product refactor.
- `meetingEntry` selects route/tutorial behavior; it is not an independent Meeting View state. `VideoTileItem` is a track model rather than a participant model.
- `offices/chat.ts` and `socialMessages.ts` on the server deliver nearby chat to the same **media channel**, including connected proximity components. Nearby chat is not a distinct meeting chat scope.
- `chatRepository.ts` currently shares a 10,000-message retention pool across office and DM history. Unread state is local to the browser. Rich chat needs a migration and retention decision, not just new tabs.
- `claimOfficeDeskZone` stores ownership inside map geometry. Personal decoration must not keep expanding the whole-map revision boundary.
- Busy/in-meeting/Away now suppress automatic media and social interruptions without pausing movement; shared policy and movement compatibility tests enforce this distinction.
- Current room locks are transient occupancy locks; follow starts immediately with a target alert/cancel. Neither is a substitute for admit/request lifecycle.
- Current prop persistence permits office members to save the prop collection. Desk-only editing needs server-enforced object ownership before the UI exposes that promise.
- Realtime social coordination is process-local. Multi-process support is a future architecture gate, not a property of the current deployment.

Source anchors: `packages/client/src/ui/{OfficeApp.tsx,workspace/,social/,media/}`, `packages/client/src/world/{WorldCanvas.tsx,WorldControls.tsx,map2d/,camera/}`, `packages/server/src/offices/{OfficeRoom.ts,repository.ts,chat.ts,chatRepository.ts,socialMessages.ts,spotlight.ts}`, `packages/server/src/media/service.ts`, `packages/shared/src/`.

## Target user journeys

1. **First day:** accept invite → choose name/avatar → verify microphone/camera → enter 2D office → claim a desk → find and wave to a teammate. Permission denial still permits office/chat entry.
2. **Quick question:** search a person or click their avatar → inspect availability → Go to / Wave / Meet / Message. Meet requires acceptance; Go to reports blocked/unreachable destinations.
3. **Public conversation:** see nearby participants → Listen / Join / Mute → join with current AV intent → leave without losing chat or unexpected microphone activation.
4. **Private discussion:** lock desk/room conversation → another person requests access → admit/decline → confirm only admitted participants receive media. Unlock restores the declared public policy.
5. **Scheduled meeting:** reminder → one-click navigation/join → Meeting View → screen share/chat/raise hand → return to Office View without creating a second media session.
6. **Focused work:** Busy mutes interruptions according to preferences; office navigation remains usable. Away has a documented visibility/media policy. Custom status expiry and reconnect are deterministic.
7. **Asynchronous work:** open inbox/channel/DM → read/reply/thread/search/share file → unread state agrees after reload and on a second session.
8. **Office operations:** admin adds a team area, assigns desks, publishes the draft and admits a guest. Personal decorations and newer prop edits survive stale map drafts.

## Architecture decisions before expansion

Use separate concepts, even where today's code conflates them:

| Concept | Authority and invariant |
| --- | --- |
| Availability | User intent/preferences plus explicit idle/calendar policy; distinct from transport connectivity and movement permission |
| Spatial presence | Colyseus-owned position, facing, collision and zone membership |
| Conversation | Server-owned identity, membership, privacy and lifecycle; geometry can discover or propose membership |
| Media target | Derived from authorized conversation membership; existing LiveKit session coordinator owns transport and local publish intent |
| Meeting | Conversation metadata, room/host/schedule; Office/Meeting **view** is client presentation only |
| Desk | Stable identifier and ownership/preferences linked to layout footprint; personal objects have explicit ownership |
| Chat conversation | Persistent authorized membership, messages/read cursor; meeting/nearby lifetimes remain explicit |
| Notification | Recipient-scoped actionable event with read state; separate from audit history |

Add neutral shared command validators/types alongside each vertical feature. Extract touched handlers into focused server modules and use additive registered migrations. Move UI into `workspace/`, `people/`, `meetings/`, `chat/`, `notifications/`, `settings/` and `editor/` only as each feature needs them. Keep pure selectors/state transitions outside React; keep `world/` independent of `ui/`.

Do not rewrite the whole application first. The existing office, movement and media loop stays playable after every PR. Explicitly migrate legacy statuses, desk ownership and office/DM history; compatibility adapters have named removal criteria.

## Delivery roadmap

Each row is one implementation phase and one reviewable PR. Bundles below are release milestones, not single oversized PRs. Split a row again if it exceeds ten engineering days; it must still deliver a complete usable flow. Dependencies are minimum gates; independent client/art and server work can proceed in parallel after shared contracts are settled.

### Milestone A — credible visual and interaction baseline

| Phase | Deliverable | Depends on | Acceptance |
| --- | --- | --- | --- |
| P00 | Reference journey inventory, runnable authenticated QA, finish current UX patch | — | Current changes reviewed; test baseline recorded; two independent Compose sessions available; reference states/screens documented |
| P01 | Shell/main menu/office switcher, reusable panel/dialog focus policy and design tokens | P00 | Open/switch/close panels by keyboard and pointer; focus returns; overlays do not leak movement; light/dark/system supported |
| P02 | Command search for people, rooms and actions | P01 | Cmd/Ctrl+K focuses search; typing never moves avatar; result can locate or navigate; empty/denied results handled |
| P03 | Member directory and reusable person card/actions | P01 | Online/offline search; same actions from map/list; correct status/avatar; offline DM and removed-member states |
| P04 | Simplified/Immersive/Auto office presentation | P01 | Same coordinates/collision across modes; manual mode persists; automatic transition is stable; rooms/people readable at overview |
| P05 | Gather-style movement and wayfinding contract | P02, P04 | Pin exact single/double-click semantics from reference; drag never accidentally walks; route destination/cancel/failure visible; keyboard/touch alternatives |
| P06 | Avatar/office art and animation pass | P04 | Consistent desk/room scale, seated/idle/walk/facing/speaking states; original or existing licensed art; dense scenes retain legibility |

### Milestone B — people, desks and conversations

| Phase | Deliverable | Depends on | Acceptance |
| --- | --- | --- | --- |
| P07 | Availability/custom status/expiry and audio policy | P03 | Busy behavior is explicit and does not silently freeze navigation; reconnect restores status; mic/camera remain off until user intent |
| P08 | Stable desk model and claim/return/unclaim migration | P03 | Simultaneous claim has one winner; existing owners migrate; return-to-desk respects authoritative routes; deleted/moved desk handled |
| P09 | Personal desk decoration and preferences | P08 | Member edits only permitted objects; stale edits cannot erase another member's changes; save/cancel/reload works |
| P10 | Team seating and admin desk manager | P08 | Assign/move/unassign with role checks, conflict handling and notification; removed members release access |
| P11 | Prejoin, device selectors and AV settings | P01 | Mic meter, camera preview, selected devices, permission denial/retry and unplug recovery; no unintended publishing |
| P12 | Stable conversation lifecycle with spatial adapter | P07, P11 | Existing proximity still works through new model; join/leave/reconnect are idempotent; authorized media target has one owner |
| P13 | Public conversation cues and Listen/Join/Mute | P12, P04 | Three clients see matching membership; per-conversation mute and auto-listen setting work without cross-room audio |
| P14 | Meet / Invite to join me | P12, P03 | Accept/decline/cancel/expiry; stale acceptance rejected; accepted request navigates both users to a valid destination |
| P15 | Private conversation lock, knock and admit | P12 | Unadmitted client cannot obtain/reuse media access; admit/revoke/leave and guest expiry tested; privacy indicators match server state |

### Milestone C — complete everyday meetings and messaging

| Phase | Deliverable | Depends on | Acceptance |
| --- | --- | --- | --- |
| P16 | Office/Meeting views and participant-first tiles | P12, P11 | Camera-off people visible; pin/grid/active-speaker views; switching view preserves media and spatial membership |
| P17 | Multiple screen-share stage and meeting controls | P16 | Two concurrent shares selectable/zoomable; share-ended fallback; raised-hand order and context; preserve mute intent |
| P18 | Temporary meeting chat and Nearby quick chat | P12, P16 | Correct membership/audience and expiry; quick-chat shortcut respects editor focus; reconnect does not leak previous conversation |
| P19 | Persistent channels/groups and conversation inbox | P03 | Public/private channels and group DM membership enforced; existing office/DM history migrated; explicit retention policy |
| P20 | Read cursors, per-thread drafts and delivery acknowledgement | P19 | Reload/two sessions agree on unread; failed send can retry once without duplicates; draft never goes to a different recipient |
| P21 | Replies, mentions and message reactions | P19, P20 | Thread context preserved; mention recipient access checked; reaction toggles converge across sessions |
| P22 | Rich formatting, edit/delete and authorized text search | P21 | Safe rendering/code blocks; edited/deleted replies coherent; search never exposes private conversations to nonmembers |
| P23 | Attachments and previews | P19 | Bounded uploads, access-controlled download, upload cancellation/error/retry and retention cleanup; no arbitrary executable preview |
| P24 | Personal notification inbox and preferences | P14, P20, P21 | DM/mention/invite actions, read state and preference suppression persist; audit activity remains separate |

### Milestone D — office administration and scheduled collaboration

| Phase | Deliverable | Depends on | Acceptance |
| --- | --- | --- | --- |
| P25a | Room metadata and local reservations | P15, P24 | Capacity and availability visible; concurrent bookings have one winner; cancel/rebook and correct-room join work |
| P25b | Calendar OAuth connection and read-only agenda | P25a | Connect/revoke/reconnect; timezone and event visibility policy explicit; reminders and correct-room links work |
| P25c | Calendar scheduling and synchronization | P25b | Create/update/cancel converge; webhook/poll retries deduplicate; conflicting bookings and provider outages handled |
| P26 | Calendar scheduling extension | P25c | Creates correct office/room link, handles account/office switch and expired session; permissions limited to required surfaces |
| P27 | Calendar smart status and external-meeting flow | P25b, P07 | Manual override wins; event changes/overlap/timezone tested; private calendar details are not broadcast |
| P28 | Guest check-in and temporary meeting access | P15, P16 | Host accepts/declines; expiry/revoke enforced by media and API; guest cannot claim/decorate/read team chat |
| P29 | Coworking sessions | P13, P24 | Freeform/focus/Pomodoro timing authoritative; focus/break media policy consistent; topic/join/leave/notify usable |
| P30a | Studio templates and team-area metadata | P08, P10 | Open/private/hybrid template preview/publish; names/team assignment; desk ownership migration explained |
| P30b | Studio room/team-area placement and resize | P30a | Move/resize validates placement and connectivity; save/cancel/conflict preserve newer props and assigned desks |
| P31 | Decorator productivity and transaction history | P09, P30b | Undo/redo, duplicate/multi-select and placement feedback; geometry/props revision boundaries remain separate |
| P32 | Interactive whiteboards/tools/games and celebration objects | P12, P31 | Shared object identity; iframe fallback and provider persistence clear; object removal and permission boundaries tested |

### Milestone E — advanced v2 parity

| Phase | Deliverable | Depends on | Acceptance |
| --- | --- | --- | --- |
| P33 | Meeting recording and permissioned artifact delivery | P16, P24, P28 | Visible recording state; start/stop/failure; participant access snapshot; storage expiry/download authorization |
| P34 | Meeting transcription pipeline | P33 | Job retries/idempotence, speaker attribution limits, partial failure and transcript access; provider/language quality benchmark |
| P35 | AI meeting notes and action items | P34 | Notes reference transcript timestamps; uncertainty visible; generation cannot broaden artifact audience; notification when ready |
| P36 | AI search across authorized office knowledge | P22, P35 | Confirm target reference behavior first; permission filtering before retrieval; citations and no-answer state; revoked access disappears |
| P37 | GitHub activity integration | P03, P24 | Organization/user connection and revoke; webhook dedup; chosen repository visibility explicit; guest policy enforced |
| P38 | Spotify listening status/music entry points | P07 | Opt-in/revoke; inactive/provider errors clear; never imply shared playback rights from profile activity |
| P39 | Smart webhook objects | P31 | Per-object/office scoped credentials, signed events/replay protection, bounded update rate, visible activity and revoke |
| P40 | Mini Mode in supported browsers with fallback | P13, P16, P24 | Join/mute/status controls and media continuity; unsupported browsers get a compact in-app view; closing does not drop meeting |
| P41 | Desktop wrapper, menu-bar presence and optional app status | P40, P07 | Explicit opt-in app allowlist; OS permissions/update/signing design; status stops after opt-out; desktop-only behavior labelled |
| P42 | SSO and enterprise access policy | P28 | SAML/OIDC integration choice settled; domain verification, session invalidation, admin recovery and cross-office isolation |
| P43 | Release performance, resilience and parity audit | All selected release phases | Full journey matrix passes; evidence-backed concurrency target; accessibility/browser coverage; operational recovery rehearsal |

P25a–c and P30a–b deliberately separate provider integration and editor geometry into playable PRs. P33–P36 require a cost/storage/provider decision before implementation; they are part of the plan rather than silently omitted. Recording is not automatically enabled by adding the service.

## Ordering and parallel ownership

Core dependency path: P00 → P01/P03 → P07/P11 → P12 → P13/P15/P16 → P17/P18. Chat can progress independently through P19 → P20 → P21/P22/P23 → P24. Desk/art/editor work can proceed beside both after ownership contracts are agreed.

| Workstream | Owner | Primary scope |
| --- | --- | --- |
| Client experience | Client implementer A | Shell, people, profiles, status, chat, notifications |
| World and media experience | Client implementer B | 2D modes/art, navigation, participants, meeting layouts, devices, editor |
| Collaboration backend | Server implementer A | Conversation/meeting/desk contracts, media authorization, guests |
| Persistence/integrations | Server implementer B | Chat/read state, calendar, background jobs, provider connections |
| Verification/design | Independent reviewer + QA; product/design input | Reference journeys, denial/reconnect tests, visual review, browser/load evidence |

Do not assign two agents concurrent ownership of OfficeApp or OfficeRoom. Feature modules can be parallel; one integration owner handles each coordinator. Refactor the block being touched, avoiding a large unrelated cleanup PR.

Planning band, not a commitment: with four engineers, QA and part-time design, allow roughly **6–10 weeks for Milestones A–C core usability**, **12–18 weeks through D**, and **20–32+ weeks for the full advanced surface**. Provider approval, original art, native distribution and AI quality can extend this. Re-estimate from completed P00–P03 cycle time; AI coding speed does not remove integration/browser testing time. A single implementer should use engineering effort estimates rather than these parallel-team calendar bands.

## Acceptance and release gates

For every phase: build all TypeScript packages, register new test files, independently review, and capture a complete user flow. Bug fixes need a failing check before the change or after reverting it. Existing unrelated failures are tracked explicitly rather than hidden by looser gates.

- **Visual matrix:** 1440×900 and 1280×800 desktop, 1024×768 compact, 390×844 narrow; open/closed panels, long names/lists, large text, light/dark and reduced motion. Use fixed reference scenes, not subjective “looks close.”
- **Interaction matrix:** pointer, keyboard and relevant touch; focus entry/restore, Escape layering, no movement while typing; no clipped or overlapping essential controls.
- **Multiplayer matrix:** two clients for movement/presence/DM; three or more for nearby joining/private admission/multiple shares; member/admin/guest and removed-member paths.
- **Lifecycle matrix:** reconnect, background/foreground, network loss, permission denial, device removal, office switch, stale command and role downgrade.
- **Proposed performance targets:** first establish P00 baselines on named hardware/network. Aim for smooth 60 fps on the desktop reference scene, at least 30 fps on the compact target, p95 UI feedback below 100 ms, and p95 local-region intent/message acknowledgement below 300 ms. These are proposed acceptance budgets, not current measurements.
- **Scale stages:** measure 10/25/50/100 present players and representative concurrent conversations with bounded media subscriptions. Never infer media capacity from avatar FPS. Run a long session and churn test before choosing the supported number.

Protect existing contracts: server-owned movement/membership; role checks on persistence/media; map/props separate revisions; additive migrations; one active media coordinator; secrets outside client/logs. LiveKit token reuse after removal needs an enforceable design for lock/admit/guest revocation—participant removal alone is insufficient. Measure proximity group churn and office-wide chat write serialization before adding infrastructure.

Logs, test evidence and captures remain on the mounted external data volumes per AGENTS.md. Production deployment/configuration, secrets, new third-party asset packs and destructive migration actions remain separate owner decisions when those concrete phases are ready.

## First execution batch and unresolved decisions

The next batch is P00–P03, with P04 visual prototypes in parallel. Deliver a dependable shell, command search and person card before expanding the backend conversation model. Then deliver P07/P11/P12 as the first vertical conversation slice.

Working defaults for design: existing stack; 2D-first new-office experience; 3D retained; English UI strings with an extraction path for Thai; desktop browsers first; original/existing licensed art; 50-person test milestone before attempting 100. Validate these defaults during the reference review rather than blocking preparation.

Decisions needed at their phase: reference Gather workspace access for exact signed-in interactions; final availability/privacy policy; chat/recording retention and quotas; supported concurrency/hardware; provider accounts/budget for Calendar/recording/AI/SSO; whether native desktop and extension distribution are required for the first public release. Record decisions in focused ADRs when they become durable.

The current UX pass is a foundation, not completion of this roadmap. Its build/component checks do not replace authenticated multiplayer verification. Follow existing `GATHER_2D_PLAN.md`, `CAMERA_VIEW_PLAN.md` and `MEDIA_SESSION_PLAN.md` for preserved contracts; this document owns the broader delivery sequence.


## Execution record — 2026-10-15

Astra coordinated three parallel Sol owners for P01 shell/theme/dialog modules, P02 command search, and P03 membership directory/person cards. One integration owner changed OfficeApp and test registration; a separate reviewer inspected the changes. Existing server routing edits were preserved. P04 and P11 proceeded in the next batch below; later phases remain scheduled.

- **P01 implemented, acceptance pending:** office switcher, persisted Light/Dark/System, reusable native dialog focus/restore, and capture-phase input isolation. Existing legacy dialogs/panels have not all migrated to the new focus policy.
- **P02 implemented, acceptance pending:** Cmd/Ctrl+K, searchable live people/rooms/actions, locate/navigation, disabled/stale results and modal precedence. All destinations continue through existing authoritative server routes. Search does not grant private media access.
- **P03 implemented, acceptance pending:** authorized online/offline directory, removed-member filtering, shared map/list cards/actions, available avatar previews with initials fallback. Membership refresh follows focus/reconnect and a bounded interval. Offline profile fields are unavailable in the existing endpoint.
- **P00 remains open:** authenticated two-session browser journeys and the viewport/theme/focus matrix are still required. Browser automation runtime currently fails loading its browser-service module; earlier local TLS access also prevented full-app validation. Build/unit success is not accepted as visual or multiplayer parity.

Focused contract tests cover theme resolution, input isolation, command filtering/denial/shortcut precedence and directory membership/offline actions. Directory and command guard mutations were observed failing before restoration. Independent review found and corrected initial dialog focus, dark directory colors, shortcut precedence and missing test registration. Final integrated `pnpm build` passed and the client suite passed **155/155**; `git diff --check` passed. Latest independent source review reports no remaining actionable findings in this batch. Evidence: `/Volumes/ssd-fluke/BaseData/GAMVerse/gather-parallel-20261015/build-client-tests-final.log`. Browser focus/theme/layout and authenticated multiplayer checks remain unverified.


### Progressive batch 2 — P04 and P11

Three parallel Sol owners implemented map presentation, AV device lifecycle, and prejoin/device UI; Astra integrated WorldCanvas and OfficeApp. P04 supplies distinct Simplified/Immersive rendering, persisted manual selection, Auto zoom hysteresis, fixed screen-size room labels and mode-sensitive caches. Coordinates, picking and authoritative collision remain shared.

P11 supplies optional prejoin from the office list/switcher and in-office AV settings: persisted mic/camera/speaker selection where supported, explicit private microphone meter/camera preview, permission retry, stale capture cleanup and unplug fallback. Active-room device switch errors remain in the dialog. Prejoin starts the next office media session muted; automatic saved-route, create-office and invite entry can still skip this optional check. Existing publishing controls retain user intent.

Browser tooling recovered through Playwright with external-volume artifacts. Production P01–P03 components passed loopback fixture checks for dark appearance, initial command focus, room dispatch, offline member actions, modal precedence, office switching and layered Escape/focus restoration. These fixtures use synthetic data and do not establish authenticated multiplayer acceptance. The actual Compose app remains blocked by local TLS protocol/certificate errors; certificate warnings were not bypassed.

Batch 2 `pnpm build` passed, client tests passed **178/178**, and independent review reports no remaining actionable findings. Production-component Playwright fixtures showed distinct map modes with identical click-to-world coordinates, Auto at overview zoom, permission denial with usable muted join, no capture on mount, virtual camera preview, stopped tracks on close and canceled delayed join completion. Evidence: `/Volumes/ssd-fluke/BaseData/GAMVerse/gather-progressive-20261015/batch2-build-tests.log` and `pw-output/`. P00 authenticated sessions and real hardware/media acceptance remain open; P04/P11 are not declared full reference parity from unit/component evidence alone.


### Progressive batch 3 — P07 and bounded P05

Implementation started with separate server/shared, client status UI and world wayfinding owners; Astra retains OfficeApp/WorldCanvas integration ownership.

P07 working policy: availability is separate from transport presence and movement. Add explicit user Away while preserving legacy wire statuses; Busy (legacy DND), in-meeting and Away suppress automatic media and interruptions without freezing navigation. Entering a suppressed state clears publishing intent so returning Active does not enable a microphone/camera. Break/travel presets remain compatible. Custom text/emoji are visible to authorized peers in the same office, persisted per office/user with an optional server-authoritative expiry (maximum 30 days). Omitted custom status preserves it, explicit null clears it. No idle/calendar automation or media access grant changes. A new additive migration owns storage; existing migrations and unrelated route edits remain unchanged.

P05 retains current single-click walk and drag-to-pan until signed-in reference semantics are confirmed. This slice verifies drag/cancel thresholds and adds authoritative travel feedback/cancel controls where absent. It does not claim exact Gather click parity without reference evidence.

Implemented P07 adds Away, custom text/emoji/expiry, correlated nonoptimistic saves, per-office storage (migration 023), shared interruption/media policy and movement compatibility. P05 adds persistent route/cancel/failure feedback, pointer-cancellation guards and bounded response waiting. The legacy route protocol has no request IDs: replacing an active route or timing out disables destination markers until office reset, preventing stale responses from marking an incorrect destination. Ordinary first routes retain exact markers. This limitation remains a follow-up protocol requirement.

Integrated `pnpm build` and **212/212 client tests** passed. The isolated server suite passed **115/115** with fixture-compatible origin and storage; shared tests passed **55/56**, with only the previously recorded unsafe-URL validator baseline failure. A separate synthetic RAM-only PostgreSQL probe applied migrations 1–23 twice and verified availability save/load, expiry, office isolation, membership denial and unchanged-save timestamps. No migration was applied to user data by that probe. Review identified and corrected a concurrent same-account join race across asynchronous preference loading. An actual overlapping onAuth/onJoin regression failed before the fix and passed afterward (20/20 focused session-security tests); independent recheck reports no outstanding P05/P07 findings.

Production AvailabilityDialog browser checks passed at 390×844: 81-character rejection, preset/Away/30-minute save, disabled pending controls, Escape retaining pending edits, 24px inner spacing and no horizontal overflow. Batch 2 also passed persisted microphone selection on reopen, unsupported-speaker disabling and narrow device-dialog scrolling. Evidence is under `/Volumes/ssd-fluke/BaseData/GAMVerse/gather-progressive-20261015/`: `batch3-build-client-tests-final.log`, `batch3-server-isolated-tests-2.log`, `availability-db-probe.log`, `component-browser-evidence.md` and `pw-output/status-narrow-padding.png`. These component fixtures do not establish authenticated LiveKit or multiplayer acceptance.

### Progressive batch 4 — P06 and P08

Separate Sol owners implement render-only seated/idle/walk cues and deterministic dense-name layout (P06), and stable canonical desk identities/claim persistence with legacy map compatibility and authoritative return intent (P08). Existing licensed art is retained. Personal decoration and admin desk assignment remain P09/P10; desk migration must preserve existing valid owners, serialize conflicts and make deletion/movement behavior explicit. Astra retains client coordinator integration and test registration; root owns consolidated gates and isolated multiplayer/database acceptance.

P06 render modules are integrated: original shoulder/foot/chair cues, distance-driven gait and stable dense-name selection preserve server positions and settled-frame redraw suppression. Four new tests are registered; 19 focused checks passed, stationary-seat and collision mutations failed before restoration, and independent review reports no findings. P08 review found a delayed-return intent race and an already-at-desk empty-route failure; both are being corrected before final batch acceptance.


Batch 4's initial consolidated build and **230/230 client tests** passed before the final return-intent review corrections. A separate synthetic PostgreSQL probe verified migration 024 duplicate/nonmember preflight rollback, valid-owner backfill and idempotence, simultaneous claim with one winner, outsider/foreign-owner denial, stable IDs through movement, forged map ownership ignored, retirement on deletion and new unowned IDs after recreation. Evidence: `desks-db-probe-final.log` in the progressive external folder. The corrected routing race and already-arrived case require the final gate below before acceptance is closed.

Development watch behavior: the existing Compose API watcher automatically initializes registered migrations on restart. Read-only inspection confirmed migration 023 applied to the configured development database at 2026-10-15 07:00:15 UTC and 024 at 07:22:03 UTC. No rollback or deletion was attempted; applied migrations are immutable. Earlier isolated-probe statements describe only those probes, not the watched development database. Further schema registration must account for this automatic execution.

Authenticated browser progress: an isolated loopback application with synthetic accounts and RAM-only PostgreSQL now supports two real browser profiles without changing Caddy, certificates or `.env`. Both users registered, selected avatars and entered the same office through the actual UI; Busy/Away custom status propagated to the other user's directory and survived reload, and the dock hand-raise control changed state. Synthetic membership was seeded for the second user. LiveKit signaling/media remains a separate acceptance gate.

### Progressive batch 5 — P12 and bounded P16

Implement the stable conversation model as a projection of existing authoritative spatial membership, not a second admission registry. Logical conversation identity is separate from the current LiveKit target; deterministic overlap rules preserve proximity continuity across merges/splits. Versioned recipient-scoped snapshots drive the existing sole media session owner. Token grants must check current office membership, active session and exact authorized target before and after minting. Busy/Away participants remain visible while their local media policy suppresses automatic connection.

The participant-first Meeting view consumes that admitted roster plus actual LiveKit participant/publication state joined by explicit media identity. Camera-off people remain visible; pin/grid/active-speaker and Office/Meeting switching change presentation without reconnecting or publishing. Expanded simultaneous-share controls remain P17, explicit Listen/Join P13 and invitations/private admission P14/P15. No database migration or provider placeholder is part of this batch.

Final P06 browser evidence covers 24 renderer cases (10/25/50/100 players × 4/12/24 px/m × both modes), unchanged click coordinates, motion/seat transitions and zero additional draws over 120 settled animation frames. Dense-scene acceptance found indicators under later heads; a separate final indicator pass corrected it, with a regression observed failing before restoration and a visually checked 100-person screenshot (`avatars100-indicators-final.png`). P08 final independent recheck reports no outstanding findings after pending-intent cancellation and already-arrived corrections. Final consolidated batch 4/5 build and suites passed as recorded below; authenticated three-session acceptance is underway.

Operational test correction: the initial full server command inherited Compose database settings. Its auth fixture created a synthetic `suspend-*` account before an account-pruning attempt failed; the pruning transaction rolled back, but fixture account/audit entries may remain. No cleanup or deletion was performed. All subsequent full server runs use an isolated process without inherited database configuration, and migration probes use separate synthetic databases. The development database therefore cannot be described as untouched.


Safe full-server verification: `auth.test.ts` expects file-backed fixture storage. Do not run the full server script inside the configured Compose application container, because its PostgreSQL environment points at development data. Use the isolated recipe below: read-only dependency/source volumes, no inherited database environment, external working directory and fixture-compatible origin. Choose a fresh log filename for each run.

```sh
docker run --rm --name gamverse-server-qa-20261015 \
  --volumes-from gamverse-office-dev-1:ro \
  --mount type=bind,src=/Volumes/ssd-fluke/BaseData/GAMVerse/gather-progressive-20261015,dst=/qa \
  --workdir /qa --env NODE_ENV=test --env CLIENT_ORIGIN=http://localhost:5173 \
  --log-driver none node:24-alpine node --input-type=module -e '
import fs from "node:fs";
import { spawnSync } from "node:child_process";
const root = "/workspace/packages/server/";
const args = JSON.parse(fs.readFileSync(root + "package.json", "utf8")).scripts.test
  .split(" ").slice(1).map(value => value.startsWith("src/") ? root + value : value);
const result = spawnSync(root + "node_modules/.bin/tsx", args, { stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
' > /Volumes/ssd-fluke/BaseData/GAMVerse/gather-progressive-20261015/server-isolated-next.log 2>&1
```


Batch 4/5 final integrated gates passed: `pnpm build`, **247/247 client tests** and **140/140 isolated server tests**. Shared tests passed **60/61**, with only the previously recorded unrelated unsafe-URL validator baseline failure. Independent review reports no outstanding P06/P08/P12/P16 findings. P12 focused tests cover exact meeting target authorization, role loss during mint, session revocation, merge/split continuity and idempotent snapshots; P16 tests cover camera-off admitted members, opaque identity matching, stale bindings, observer cleanup, pin/departure/share fallback and presentation-only selection. Evidence: `batch5-build-client-tests.log`, `batch5-server-isolated-tests.log` and `batch5-shared-tests.log` in the progressive external folder.

A separate actual repository probe also verified that removing an office member releases their canonical desk, clears the legacy map owner projection and denies subsequent desk reads/return; evidence `desk-member-removal-probe.log`. Root is exercising three authenticated browser profiles against isolated LiveKit with synthetic credentials. Until those checks finish, roster/media transitions and full reference parity remain unclaimed.


P12/P16 authenticated acceptance passed on three synthetic browser profiles with isolated LiveKit: all three camera-off people appeared, Alice published virtual camera/microphone tracks, Bob decoded remote video at 640×360, and pin/active-speaker/Office-view transitions preserved all three LiveKit participant SIDs and publishing intent. Away stopped both tracks while retaining Alice in the roster; returning Available did not republish. Actual HTTP token checks accepted the exact meeting target and rejected lobby alias, unrelated private zone, stale binding and incomplete binding. No real hardware was captured. Evidence includes `qa-meeting-preserves-media`, `qa-remote-video-ready`, `qa-live-grant-boundaries`, `qa-available-preserves-muted-final.log` and `three-participants-live-media.png`.

Browser acceptance found two follow-up defects that unit-only checks missed. An absent LiveKit participant displayed indefinite connecting text; it now says “Media not connected,” with RED→GREEN selector coverage and a 390×844 browser check. Canonical desk loading stored native fetch as a controller method, causing Chrome's Illegal invocation. The default transport now calls fetch through a neutral wrapper; an unchanged actual-production-controller browser fixture failed before the fix and passed afterward, alongside a receiver-sensitive regression. Desk load errors expose retry even outside a desk zone. Actual HTTP simultaneous desk claims produced one success and one conflict. Final gate for these corrections is grouped with batch 6 below.

Production-runtime verification also found that the server bundle externalized `@colyseus/schema` without declaring a direct dependency. HEAD manifest/source and the unchanged dependency layout confirmed the pre-existing missing resolution; runtime import failed before any database startup. Adding the same already-resolved schema version to the server importer and running frozen installation fixed it. The actual frozen API/realtime bundles subsequently started and readiness returned 200. No deployed configuration changed.

### Progressive batch 6 — P13 and P14

Three Sol owners split public conversation discovery/token modes, invitation routing/lifecycle, and focused client controls/offers. A single server integration owner connects both to OfficeRoom; Astra owns client integration. Discovery excludes private/locked conversations and transport identities. Approach requests resolve current public geometry and authorization on the server. Off disconnects conversation media while preserving presence; Listen clears publishing intent and requests a fresh subscriber-only grant; Join is explicit and does not automatically unmute. Auto-listen and bounded per-conversation preferences follow logical identity across transport generations. Earlier Join JWTs are not revoked by Listen; this is not a reused-token privacy guarantee.

Meet and Join me offers are recipient-scoped, revisioned and expire after 30 seconds, with bounded pending requests/replay and rate limits. Acceptance rechecks membership, active sessions, availability, current offer revision and travel intent, then prepares all public routes before committing. Private admission remains P15. Review found that a moving inviter could leave the accepted Join me location; the atomic plan now includes an empty inviter route to stop old movement before routing the invitee. Planner and actual OfficeRoom commit regressions pass. Decline/cancel/expiry and stale asynchronous outcomes are explicit; no camera or microphone starts on acceptance.

Focused client/server tests and guard mutations pass, with all new tests registered. Independent review reports no outstanding findings after the Join me, native-fetch and unsolicited route-marker corrections. Conversation composition now lives in `useOfficeConversations` and `OfficeConversationHub`; OfficeApp retains the sole media-session effect and movement coordination. An unsolicited server route hides an uncorrelated destination marker instead of reusing a previous local destination (RED→GREEN regression).

Batch 6 consolidated gates passed: `pnpm build`, **268/268 client tests** and **164/164 isolated server tests**. Shared tests passed **65/66**, with only the same pre-existing unsafe-URL validator failure. Evidence: `batch6*.log` and `qa-static-build-batch6.log` in the progressive external folder. The frozen production frontend is ready for three-profile P13/P14 and full-app My desk browser acceptance; those checks remain pending. P15 lock/admission design is read-only during that verification and requires server-owned transport epochs, not a UI-only privacy claim.

Actual full-app browser checks now confirm My desk resolves the canonical desk and arrives at the owner's zone. Listen JWTs have subscribe permission but no publish/data permission or publish sources; switching from published virtual camera/microphone to Listen stops both tracks. Join enables controls without unmuting. Conversation media-off removes Alice from LiveKit while all three office presences remain. Evidence includes `qa-listen-jwt-permissions`, `qa-listen-stops-publishing`, `qa-conversation-off`, `qa-listen-off-livekit` and `qa-invite-person-snapshot`. P14 browser acceptance found a route-planner defect: unlocked meeting rooms, including the default Town Hall, were wrongly excluded from public offer locations. The focused correction and repeat acceptance are pending; the initial gate above predates that correction.

The Town Hall correction now uses one route eligibility rule allowing unlocked meeting rooms and passages while preserving walls, props, private zones, restrooms and locks. Actual generated-map tests failed before the fix; server typecheck and 20 focused tests pass afterward. Independent review has no findings. Evidence: `meet-townhall-red.log` and `meet-townhall-green.log`; consolidated and authenticated browser repeat remain pending.

The correction gate passed `pnpm build`, **270/270 client tests** and **166/166 isolated server tests**. Actual browser retry revealed three overlay collisions missed by component-only tests: notices behind the header, room controls behind the rail and Meeting view over 2D controls. A focused `OfficeContextOverlay` now puts these controls and notices in a bounded flow stack below the header beside the rail; server error reasons remain intact and browser network failures show readable recovery text. Independent review is clear. The real pointer retry now restores My desk, the room card clears the rail/header, and Meeting view no longer overlaps map controls. Authenticated Town Hall Join me now reaches the recipient and accepts successfully. Moving-inviter and narrow viewport repeats are still running; P15 starts against separate source while QA retains the frozen corrected bundles.

The remaining bounded P13/P14 browser repeats passed: accepting Join me stops a moving inviter's old route, Meet decline and cancellation agree on both clients, and the 30-second invitation expiry is visible. At 390×844 the Conversations dialog fits without horizontal overflow. The final batch 6 evidence is consolidated in the external `component-browser-evidence.md`; the isolated synthetic-account/virtual-media checks do not establish public deployment or complete Gather reference parity.

### Progressive batch 7 — P15

P15 is planned as a separate access-coordinator, media-epoch/grant and client-admission batch. Existing authority stays intact: a desk owner must be inside their desk zone, and current admitted meeting occupants retain meeting lock rights. No office-admin listening bypass is added. Admission, movement entry, conversation projection and private chat audiences must share server authorization. Old JWTs may reconnect to an abandoned old LiveKit room until expiry, but must never hear the new epoch's media. Lock/admit/revoke/expiry and rotation failure need actual multi-profile verification before privacy acceptance.

P15 implementation is now assigned to three Sol owners with Astra handling the sole client integration. Knocks expire after 30 seconds and approved guest admissions after 10 minutes; these GAMVerse bounds will be shown in the UI. Only physical vacancy automatically unlocks a room, so an expired guest remaining inside cannot regain access through an empty-admission shortcut. Revocation failure blocks only the affected zone and exposes bounded retry. No database migration or configuration change is part of the batch.

The implemented client exposes a safe map-name room selector in Talk and a Room privacy action on the existing room card. Requesters see their own outcome; only server-authorized moderators receive the pending queue and revocable guests. A recipient-only admission lease ID mutes first admission and fresh re-admission. Already admitted members retain existing microphone intent across an epoch change; camera and screen sharing remain off after the existing session transition. Admission or departure can therefore require occupants to explicitly re-enable camera/share even while remaining in the same room. P17 presentation-continuity acceptance holds membership stable; preserving already-consented tracks across a same-room rekey remains future media UX work. Confirmed revocation clears microphone intent. An unknown transport snapshot leaves media disconnected without inventing revocation, while explicit Busy/Away suppression still clears intent.

Independent review found and resolved unlocked-room departures retaining an epoch, unbounded access-refresh queries, vehicle-exit fallback crossing admission boundaries, and availability suppression bypass during an unknown snapshot. Regression evidence includes actual OfficeRoom vehicle failures before the fix, access-flood/stale-result checks and composed preference/media-intent RED→GREEN tests. A normal early Retry now remains an expected refusal instead of an infrastructure error. Final source review has no outstanding findings. Focused client checks pass **22/22**; media tests include actual SDK HTTP timeout and old/new JWT room isolation. Consolidated suites and multi-profile privacy acceptance remain pending.

The first batch 7 consolidated gate passed the production build and **285/285 client tests**; shared tests passed **68/69**, with the same known unsafe-URL failure. The isolated server gate passed **191/192** and exposed a new existing-session presence regression in `officeSessionSecurity.test.ts` after the real onAuth/onJoin path. P15 acceptance remains held for diagnosis, correction and repeat verification; the expected security behavior is not weakened to pass the gate.

That regression was reproduced in the isolated environment: the joining session's existing avatar incorrectly blocked its own spawn, causing an early denial and removal of its session-security record. Spawn occupancy now excludes only the joining session, matching reconnect behavior; strengthened real-join assertions and related security/movement tests pass **33/33**. A further collision-contract check found that restricted landing worlds discarded the existing spatial blocker grid. Empty restrictions now preserve world/grid identity, while denied-zone buckets overlay the original grid without losing grid-only blockers. P14 routing reuses the same helper. RED regressions, shared/server typechecks and **28/28** focused tests pass; independent rechecks are clear. The repeat consolidated gate and real privacy flow remain pending.

The final batch 7 gate passed the production build, **285/285 client tests** and **195/195 isolated server tests**. Shared tests passed **68/69**, with the unchanged URL expectation failure; that failure is not yet evidence of a production vulnerability and needs its own contract diagnosis. Logs are `batch7-final-*.log`. The isolated QA backend runs the verified production bundles; the frontend was rebuilt with explicit production mode before any P17 client edits (`qa-static-build-batch7-production-env.log`).

Authenticated three-profile privacy acceptance passed against that frozen snapshot: locked movement was blocked; an outside requester saw no moderator queue; knock/admit enabled entry with microphone muted; existing occupants retained their microphone intent across lock/admit. Revoke cleared the guest's microphone intent and denied a stale grant with HTTP 403 while retaining office presence. Re-admission started muted again. An actual old JWT could connect only to an abandoned empty LiveKit room; current occupants moved to a different epoch. Guest departure rotated again while the two remaining occupants retained their microphones. At 390×844 the dialog had no horizontal overflow and Revoke remained reachable. The initial guest countdown could display 11 minutes, and scrolling moved Close offscreen; bounded display clamping and body-only scrolling are included in the next client gate. Full ten-minute wall-clock expiry and forced media-admin failure were not browser-simulated; focused state/SDK tests cover those paths. Evidence is consolidated in external `component-browser-evidence.md` and `p15-*.log`.

### Progressive batch 8 — P17

Three Sol owners implemented server/shared authoritative FIFO hand ordering, client hand-state/queue presentation, and selectable screen-share zoom/fit. P16's existing share chooser and ended-share fallback are retained. Lowering and re-raising moves a hand to the queue tail; departure, admission loss and conversation changes clear it. Both legacy dock and meeting controls use the same server authority. Review found a pending authorization could survive an A→B→A conversation transition; context invalidation now rejects it, with a deferred-authorization regression and fail-on-revert proof. Presentation zoom is bounded from 100% to 300%, resets on selection/context changes and preserves the existing media session. Focused server, client queue and share checks pass; independent final review and consolidated gates precede browser acceptance using synthetic canvas sharing and virtual devices, never the operator's desktop.

Batch 8 production build and isolated server checks passed (**203/203**); shared tests passed **70/71** with the same unresolved URL expectation. The registered client run exposed two test fixtures using a malformed request ID that the actual built shared validator correctly rejected. Valid UUID fixtures preserve the context/disposal assertions and add explicit malformed-ID rejection. The full registered client run reproduced **296/298 RED**, then passed **298/298 GREEN**; independent recheck is clear. These corrections changed tests only, so the frozen production QA snapshot remains valid. P17 multi-profile share/hand acceptance is running; the P15 countdown and fixed-header corrections are included in that client snapshot.

The final root build and **298/298 client tests** passed again (`batch8-final-build-client-tests.log`); server **203/203** and shared **70/71** cover the same unchanged runtime. Actual three-profile browser acceptance passed simultaneous synthetic shares, selection/zoom/Fit, ended-share fallback and FIFO hand behavior. The P15 initial countdown and always-visible Close corrections also passed on mobile. These checks use synthetic canvas/virtual devices and stable membership for presentation continuity; they do not claim camera/share continuity across an admission epoch change. Evidence is in external `component-browser-evidence.md`.

### Progressive batch 9 — bounded P10 and furnished creation

Three Sol owners are implementing canonical admin desk assignment, the desk manager/creation UI and an existing-asset furnishing helper. Owner/admin/maintainer actions assign an empty desk, unassign its exact current owner or atomically move an assignment to a vacant desk. Server transactions recheck current role, membership, suspension, stable desk identity, map version and expected ownership; there is no implicit displacement or team entity. A versioned refresh notifies affected online members. The new-office form offers a recommended furnished starter or empty interiors, using the existing separate props save. Saved offices and editor regeneration retain their current contents.

The assignment failure-path survey found that fresh media checks alone do not clear cached private chat/movement ownership if a committed change cannot reach realtime. The bounded prerequisite is a pre-commit, affected-zone access fence through the existing internal service boundary. Failed preparation leaves ownership unchanged; uncertain or committed changes keep the affected zone unavailable until a matching operation/version is reconciled. This adds no migration or configuration and must pass independent race/recovery review before the batch gate. P09's protected personalization storage remains a separate slice because the existing member-editable global props endpoint cannot enforce per-desk ownership by itself.

The furnishing slice passed independent review and **5/5** focused tests, including catalog support, deterministic empty output, the overall prop budget and real walkable paths to doorways/seat approaches across representative sizes. Deliberately blocking an aisle and removing budget guards produced two RED failures. A 10-person/two-team furnished office contains 226 starter props alongside its 293 existing landscape props. Client manager checks pass **22/22** with type-check success, including stale responses, targeted notification ordering and admin recovery without an owner notification. Independent review required three server/integration corrections: avoid refreshing unchanged live maps on an ordinary manager read, return authoritative recovery status to a non-owner admin, and bound requests before database lock acquisition. The final server evidence, combined gates and actual visible-flow acceptance remain pending.

All three findings were corrected and independently cleared. Server focused checks pass **32/32**, with genuine RED evidence for authorization, flood bounds, stale private access, the room-creation race and an ordinary manager read interrupting real desk travel. A final strict-validator regression rejects array/object sync states without string coercion. The consolidated batch 9 gate passed `pnpm build`, **320/320 client tests** and **220/220 isolated no-database-environment server tests**. Shared tests passed **78/79**; only the existing `propInteraction.test.ts:19` URL expectation failed. Diff checks are clean. Logs are `batch9-build-client-tests-20261015-1.log`, `batch9-server-isolated-tests-20261015-1.log` and `batch9-shared-tests-20261015-1.log` in the external progressive folder. Actual desk administration/furnished-creation browser acceptance and post-rebase verification remain pending; source is frozen for those checks.

Actual browser acceptance then passed admin assignment, move and unassign with HTTP 200 and persisted/applied confirmation; an ordinary member's administration GET returned HTTP 403. Offline eligible members were selectable and the 390×844 manager had no horizontal overflow. New furnished and empty offices persisted their separate props snapshots (496 and 319 props for the tested random seeds); furnished seating/tables and retained workspace UI were visually inspected. These are creation-only checks; no existing office was automatically furnished.

The branch was fast-forward rebased onto `origin/main` at `34c2041`, with the named source stash retained and private state preserved separately. Conflict resolution preserves upstream avatar/pet, media moderation, sound, account and movement improvements alongside the new workspace. Upstream migration numbers 23/24 overlapped historical availability/desk registrations, so forward-only compatibility migrations 25–27 preserve both histories without changing applied SQL. The actual registered initializer passed twice for fresh-through-22, upstream-through-24 and feature-through-24 synthetic RAM databases; canonical UUID/ownership/retirement/recreation, availability/expiry, custom-avatar foreign keys and historical ledger timestamps were preserved, and schemas converged. Invalid duplicate/nonmember/missing-owner histories rolled back. Root evidence is `migration-matrix-registered-2.log`; an initial external probe savepoint/connection mistake was corrected before this successful run. Post-merge build, independent review and smoke acceptance remain pending.

The compatibility matrix also has genuine RED evidence through the actual initializer using external SQL copies: removing availability idempotence fails on the existing table, forcing desk recreation fails on the canonical table, and omitting preset reconciliation rejects KayKit IDs. The corrected probes produced the intended schema failures in `migration-matrix-mutant-{availability,desks,characters}-red-2.log`; an earlier wrong-working-directory error is not counted as RED evidence. Applied source SQL and configured development data were not modified by these probes.

All rebase conflicts are resolved. Upstream route limits, proximity epochs, avatar/pet/account behavior, maintainer identity, independent camera lock, audio processing and local volume/moderation remain integrated. The upstream 60-second hand lifetime now runs through the sole meeting-hand coordinator. Moderation uses current admitted media epochs and revalidates session/context after its final authorization await; deferred revocation/context tests produced RED before correction. Sound and AV device controls share preferences, with a tested migration from the upstream store. Independent merged client/server review is clear.

Final post-rebase verification passed the production build, **332/332 client tests** and **251/251 isolated server tests**. Shared tests passed **79/80**, with only the same existing URL expectation failure; no test was skipped or weakened. Working and staged diff checks are clean, no unmerged paths remain, and private `.devmode.json`/environment files are not staged. Evidence: `rebase-build-client-tests-20261015-2.log`, `rebase-server-isolated-tests-20261015-1.log`, `rebase-shared-tests-20261015-1.log`. The first build attempt lacked a nested `pnpm` executable in the isolated sidecar; external Corepack shims fixed that tooling issue. Root retains the final post-rebase browser smoke and local watcher-resume decision. No commit, push or production deployment is claimed.

### Remaining bounded batches

Owner steering now ends implementation after the current visible batch and its verification, followed by a rebase onto main. P09 personal desk decoration/preferences and full P10 team seating remain open Milestone B work; the current admin-assignment slice does not invent a team model or claim completion of it. No new roadmap schema or provider feature is part of this delivery; required rebase compatibility is handled separately.

For rebase conflicts, the owner explicitly prefers the improved workspace, People, dock and meeting UI where it replaces older upstream presentation. Preserve upstream behavior and security, media, performance, account and pet functionality with their tests. The root delivery owner handles source preservation, conflict resolution and the forward-only migration compatibility plan in `GATHER_MAIN_REBASE_PLAN.md`; these compatibility migrations reconcile already-applied history and do not add another roadmap feature.

Actual new-office screenshots also expose a furnishing gap: detailed rendering of sample props does not make the generated office welcoming when its rooms start largely empty. Existing-asset default furnishing is prioritized with the desk work after privacy/meeting stability, before optional provider integrations. It must use the separate props persistence/version path and preserve existing edits; no new third-party asset pack is planned.

Read-only survey confirms the current generator intentionally emits empty interiors. The proposed creation-only choice is a recommended furnished starter alongside empty interiors. Saved offices will not be filled automatically. A pure zone-relative furnishing helper will feed the existing separate props save and use catalog dimensions/support checks, bounded counts, clear spawn/door approaches and representative seat routes; the editor's broad generated-ID removal heuristic will not be reused for this slice.

Final root acceptance after the merge gate: rebased production browser smoke passed with two profiles (desk-manager eligible members, Join with media off, camera-off meeting roster, authoritative remote raised-hand queue, Grid/Active speaker, ReturntoOffice and private device settings). Local watcher resumed and app container restarted successfully; Vite5173 returns200, API/realtime listeners respond, and the configured migration ledger confirms23–27. Original private state and regenerated runtime cache are preserved externally; private files stay unstaged and the source stash stays retained. No commit, push or production deployment.
