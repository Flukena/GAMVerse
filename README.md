# GAMVerse

GAMVerse is a self-hosted virtual office that runs in a browser. Members share a 2D or 3D campus, claim private workrooms, meet in shared spaces, and talk through room or proximity-based audio. The project is an active prototype; the included production Compose profile has not been validated as a public deployment.

## Features in this repository

- Account registration and sign-in, office invitations, office-scoped owner/admin/member roles, and a separate maintainer portal.
- Platform operations for maintainers: account recovery, account role management and suspension, office-management audit history, and an aggregate system health overview.
- A server-authoritative multiplayer world with movement, collision, presence, room zones, automatic travel, vehicles, seats, and beds that avatars can lie on after standing nearby.
- Spacebar jumps in 3D view; jumps are shared with other players and do not bypass ground collision.
- In every zone, all props (trees, park, buildings, lights, bins, signals, furniture) render only while their own footprint touches a directional area around the character, independently of camera panning: 150 world units in front (the direction the character faces, not the camera), 100 to each side and 50 behind, shaped as two half-ellipses. A 15-unit exit buffer (added to every semi-axis for props already visible) prevents boundary flicker, including while turning; spatial groups only speed up rejection. Repeated scenery stays instanced and drops out-of-area instances individually. Map/prop editing disables this culling, and collision is unchanged.
- In 3D, rooms outside your current zone have a closed roof and skip rendering their interior props. Occupant names appear on the covered room with a status color dot; entering a zone opens its roof and restores its props. Map and prop editing keeps every room open. The 2D view always shows room interiors and props without roofs.
- A campus map generator driven by total people and team count. New offices offer a furnished starter using existing assets or empty interiors; saved offices keep their contents. Office owners and admins can edit room zones, doors, spawn point, roads, outdoor building components, finished buildings, and transporters; office members can edit room props and their interactions. Each member can claim one private workroom through a stable desk identity. Ownership survives room movement; deleting a desk retires that identity, and return-to-desk resolves the current owner and geometry on the server.
- New campus templates use a Campus Loop street plan: an outer loop, connected avenues and team alleys with exits at both ends. Roadside trees, lights and bins keep the driving surface clear; existing finished-building assets fill suitable empty street blocks, and five equal meeting rooms on each edge fill the strip between the inner avenue and perimeter road. Each team meeting room has 20 chairs around two carpeted conference islands, paired side lounges, presentation equipment, a refreshment wall, shelves, plants and tabletop props. Furnished floor footprints, including carpets, cover approximately 28–33% of the room while the entrance axis stays clear. Flower beds decorate the gaps between the rooms. Create an office to use the template. Saved offices keep their current maps.
- The civic strip of new furnished campuses is a greener public park with two ponds, dry bridge crossings, pale paths, grouped trees and seating. Its rooms keep light interior floors. The compact campus has a reception lobby, civic meeting rooms furnished for 50 seats each, and a 200-seat Town Hall with an auditorium stage and screen. Water blocks movement through the existing server-owned prop collision; the crossings and paths remain walkable.
- Furnished campus restrooms have ten inward-facing toilets with individual, non-overlapping dividers, five central wash stations with raised mirrors on a shared backboard, two showers, two bathtubs, and a sofa/plant/bin set on each side. The whole furnishing plan rotates with the entrance. Template updates do not automatically replace furniture in saved offices.
- Furnished private workrooms include a desk with a supported monitor and keyboard, chair, bed, plant, kitchenette, washer, and a small storage/decor set. Monitor, bed, plant, and decor variants are selected deterministically from each room's stable ID. Creation reports map or furniture save failures instead of entering a partially furnished office.
- The admin desk manager lists current members, including offline members, and supports assigning an empty desk, unassigning its owner or moving an assignment to another vacant desk. Changes recheck role, membership and current ownership, with conflict reload and affected-member notices. Occupied desks are never implicitly replaced.
- A full top-down 2D play view (M toggles 2D/3D) alongside Three.js avatars, with labelled rooms, zone floor colors based on the same ground and room colors as 3D, top-down furniture and foliage, catalog preview fallbacks, selected full-body characters with directional idle/walking/seated sprites, characters that scale naturally with 2D zoom, smoother paced walking and readable screen-sized names, collision-aware bounded name labels and foreground speaking/raised-hand indicators, a minimap on the left and player locate controls. The 2D view uses the same world metres as 3D and starts at 45% zoom (27 screen pixels per metre); 3D apparent size depends on camera distance. Vehicles, finished buildings and common furnished-campus props use transparent top-down renders of their bundled models in both 2D presentations, with fine outlines and higher-contrast scaling for readability. The 2D presentation selector offers Simplified, Immersive and Auto; Auto switches detail with stable zoom thresholds, and manual choice persists on this device. Both views use the same server-owned movement and media membership. If the browser cannot start WebGL, the office opens a playable 2D map automatically and offers Retry 3D when the browser is ready. Kenney, Quaternius, Poly Pizza, a curated 22-model Polygonal Mind CC0 avatar subset, six KayKit Adventurers CC0 characters, and 68 Gobkit CC0 pets are served from the client package.
- A persistent Office/People/Chat/Activity rail, main-menu office switcher, and per-device Light/Dark/System appearance using the GAMVerse navy, cyan and yellow palette. Owners, admins and maintainers can open Share office to create reusable, seven-day member links, copy them or revoke active links. Recipients sign in before joining; one-use and username invitations remain available in Manage office. Sign out in the lobby or office asks for confirmation; Cancel and Escape keep you signed in. Settings use native modal focus and Escape behavior; guide keyboard focus stays inside its card, and command search closes with one Escape even after typing. Cmd/Ctrl+K searches live people, rooms and workspace actions. The People directory includes offline members and shares person actions with map selection; offline members can receive direct messages. Direct 2D zoom/recenter/desk controls remain available. Chat has channel labels, remembered DM selections, message metadata, and a multiline composer (Enter sends; Shift+Enter adds a line).
- Lobby office cards and invitations show a short Office ID; its full value is available in the tooltip and can be copied, so offices with identical names can be distinguished. The lobby scrolls within the available viewport, with responsive cards and wrapping actions on narrow screens.
- The lobby and office page guides open on a member's first visit to each page and stay available from the “Show page guide” button.
- Nearby chat, persisted office and direct-message threads, emoji reactions from the bottom dock picker, and a hand-raise toggle beside reactions in the dock. Office and direct messages share a 10,000-message retention pool per office.
- Member-editable prop notes, HTTPS links, and embeds for YouTube, Google Docs/Slides, Figma, Miro, and Excalidraw. Links show their destination hostname before opening.
- Owner/admin spotlight controls with a separate office-wide media session and explicit speaker publishing consent.
- Avatars turn along the shortest angle. First-person aim controls facing while standing or strafing, and switching to third person keeps the view direction; seats and vehicles retain their facing rules.
- Camera follow smooths both position and aim in the orbit frame. V toggles third-person and first-person views in 3D and is ignored in explicit 2D. Wheel and toolbar zoom keep the selected 3D or 2D view; use the mode control or M to switch views. Toolbar `+` zooms in and `−` zooms out; in 3D this decreases or increases camera distance respectively. Third-person view starts behind the character and follows their facing direction. While heading lock is on, W/S walk along the character's facing and holding A/D turns in 45° steps; pressing S turns the character around once and walks in that direction. Right-drag releases heading lock; the separate camera-lock action toggles it, and Focus character recenters without changing the lock setting. Hold G to pass through props and cars when prompted; walls and locked rooms remain solid. The view keeps the selected zoom while walls, doors, and collision props blocking the avatar fade temporarily. Crossing doorways or media zones preserves zoom, elevation and view mode; reduced motion and world/view changes snap. First-person pitch is limited to ±75°.
- Person details use a nonmodal profile panel so viewing someone does not stop walking or automatic travel. Soft footstep sounds follow actual movement in both 2D and 3D; Settings → Sound → Ambient sounds controls footsteps and the vehicle engine together, and is on by default. Seated, driving, paused, hidden and deafened states remain silent for footsteps.
- Entering an office goes directly into the office with microphone and camera off by default. Sound settings include microphone level testing and input/output selection; Camera settings include camera selection and private preview, with background blur or a built-in office image.
- The local avatar plays a quiet Pixabay sneaker-on-concrete recording while walking or sprinting and a soft Pixabay car-engine recording while in a vehicle; footsteps stop when seated or driving, and the engine sound stops after leaving the vehicle. Both audio assets have their source and license recorded alongside them in `packages/client/public/assets`.
- LiveKit audio for meeting rooms, private rooms, and nearby groups with automatic voice recovery, preserved microphone intent, and a manual reconnect control, plus camera and screen sharing controls.
- Server-authorized conversation snapshots drive media targets while the existing voice session owns media connections. Raised hands appear in server-confirmed conversation order; lowering and re-raising moves a hand to the end. Token grants recheck office/session access and the exact conversation target before and after issuance.
- Talk and AV shortcuts live under Account and settings → Settings → General. The Talk panel lists public conversations and offers server-routed approach, Listen, Join and media-off controls. Listen requests a subscriber-only token and clears publishing intent; Join does not unmute automatically. Walking into a server-confirmed conversation joins automatically by default, without enabling microphone or camera. The automatic-join preference and explicit Listen/media-off choices persist for their existing scopes. Meet and Invite to join me requests support accept, decline, cancel and expiry, with server-validated public walking routes.
- Room privacy in Talk supports server-authorized locking, knocking, admission and revocation. Knocks expire after 30 seconds and guest access after 10 minutes. Changes rotate the room's media epoch; revoked guests lose private audio/chat access, and a failed media transition exposes a retry. New guest admissions start muted. Existing occupants retain microphone intent, but camera and screen sharing stop across an epoch change, including admission or departure, and require explicit re-enabling. Existing desk-owner and meeting-occupant permissions apply.
- Account edits preserve the office session; transient realtime drops attempt to resume the reserved session before automatically joining again.
- Per-device idle-animation preference and office-persisted availability with custom text, emoji and expiry. Busy, In meeting and Away suppress automatic media and interruptions while leaving movement available; returning to Available keeps microphone/camera off until explicitly enabled.
- Authoritative travel progress, cancel and failure feedback. Destination markers are hidden after replacing an active route or a response timeout until the office session resets, because the existing route protocol has no request identifiers.
- A voice roster shows nearby or same-zone participants, their status, and active microphone, camera, and screen-share tracks. Incoming remote video automatically fills the available office area. When viewing a screen share, the same person’s camera appears in a small overlay. The first active source stays selected as other people join; use the roster camera/screen buttons or the on-screen selector to switch sources. Minimize the viewer and expand it again without stopping video. The view moves to another active source when the selected one stops; camera and screen permission errors identify which browser or system access to check; each participant can adjust another member's playback volume or mute that member's published track in their current voice zone. Office owners/admins can mute a media source for everyone in their current zone.
- Sound settings select input and output devices, test the microphone locally, and configure noise reduction. Camera settings select and preview a camera locally and apply a blurred or image background to the local camera track.
- The Profile dialog lets each account set an optional nickname. Name tags use the player's presence status color.

See [PROJECT_DOCS.md](PROJECT_DOCS.md) for architecture, data flow, deployment notes, research, and the preserved project history. [AGENTS.md](AGENTS.md) is the development guide for contributors and coding agents. The broader Gather v2 delivery sequence is in [the parity master plan](docs/GATHER_V2_PARITY_MASTER_PLAN.md).

## Stack

| Layer | Implementation |
| --- | --- |
| Browser | React, TypeScript, Three.js, Vite |
| Realtime world | Colyseus room and server-owned movement/collision |
| HTTP API | Express and PostgreSQL |
| Media | Self-hosted LiveKit |
| Local and single-host deployment | Docker Compose and Caddy |

The API and realtime processes are separate. They share the server package and PostgreSQL; there is no distributed presence service or multi-host room routing yet.

## Run locally

Docker Desktop or Docker Engine with the Compose plugin is the supported way to run the complete local stack:

```sh
docker compose up -d
```

Open **https://localhost:5173**. Caddy uses a local development certificate, so the browser may ask you to trust its local CA before HTTPS, WebSockets, and media signaling work. The first start installs workspace packages in the development container and initializes PostgreSQL. A regular account can register from the page and create an office.

If Safari displays `Load failed` during sign-in or registration, check
`https://<DEV_HOST>:2567/health/ready` using your configured hostname or IP.
The API should return `{"status":"ready","service":"api"}`. Allowing the
app's certificate at port 5173 alone may still leave the API blocked at port
2567; review the local development certificate and trust its CA for the browser
before retrying. LiveKit signaling uses a separate HTTPS endpoint at port 7880.

For a custom local hostname, set `DEV_HOST` in an ignored `.env` file and make that hostname resolve to your machine. The same value is used for the client, realtime endpoint, and LiveKit signaling. `DEV_IP` controls the address LiveKit advertises for local media connections.

The maintainer portal is at `/maintainer`. To grant the first maintainer role to an account that has already registered, replace `your_username` below:

```sh
docker compose exec postgres-dev psql -U gammyverse -d gammyverse -c "UPDATE app_users SET is_maintainer = TRUE WHERE username = 'your_username';"
```

Platform maintainers can select the **Runtime diagnostics** card from the lobby to open
the dedicated `/maintainer/diagnostics` page, with source/event/office filters,
expandable event details and numbered pagination with Previous/Next controls.
Each visible page contains up to 10 events, fetched in bounded 50-event cursor batches.
Filters apply to the current visible page; Refresh returns to the newest events. The page shows technical incidents across all offices
for platform maintainers only (office owners/admins cannot read it). PostgreSQL
migration `030` adds seven-day persistence; the API prunes expired events hourly.
Authenticated browsers automatically report visible frame stalls/slow frames,
long tasks, uncaught/resource errors, failed realtime joins/connections and
exhausted voice retries. API/realtime sample process CPU and event-loop stalls.
No chat, error messages/stacks, URLs, usernames, session tokens or form contents
are included in these diagnostic records. Browser CPU percentages are not measured.

Collection is deliberately sampled and rate-limited: one browser event per kind
per minute, at most six submissions per account and 120 total per API process per
minute. Offline queues/retries are bounded and may lose events during outages or
browser closure; an empty panel is not proof of an error-free system. Refresh
the panel to load new events. Server CPU uses one-core units (100% = one core,
including worker threads), not container-wide CPU. See the
[diagnostics implementation and verification record](docs/REALTIME_WORKLOAD_SEPARATION_PLAN.md#maintainer-runtime-diagnostics)
for thresholds and remaining verification limits.

Stop the local stack with `docker compose down`. PostgreSQL and Caddy state remain in named volumes unless those volumes are explicitly removed.

### Workspace commands

Node.js 22+ and pnpm 11 are used for local tooling:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

`pnpm dev` starts the three application processes but does not start PostgreSQL, LiveKit, or the Caddy routing/TLS profile. Use Compose for the full office experience. The root `pnpm test` script runs the shared-package and client connection, camera, and Gather feature tests; the server package also has its own test script.

## Repository layout

```text
packages/client/src           React UI, Three.js world, client asset loaders
packages/client/public/assets Runtime 3D models, textures, previews, and license notices
packages/client/assets        Source asset packs and archives; not copied wholesale by Vite
packages/server/src           HTTP API, realtime room, auth, office, and media modules
packages/server/migrations    PostgreSQL schema migrations
packages/shared/src           Shared map model, prop catalog, movement, and collision rules
PROJECT_DOCS.md               Consolidated project documentation and historical notes
AGENTS.md                     Contributor and coding-agent rules (CLAUDE.md imports it)
```

## Production profile

The repository includes `compose.production.yaml`, `Caddyfile`, and `.env.production.example` for a single Linux host. Set a public `DOMAIN`, a `LIVEKIT_DOMAIN`, and distinct database, internal-service, and LiveKit secrets before starting it. The deployment also needs DNS, firewall rules for WebRTC/TURN, backups, and external-network verification. Details are in [PROJECT_DOCS.md](PROJECT_DOCS.md).

## Assets and licensing

Third-party model packs retain their license notices beside the runtime assets. Their source and attribution inventory is in [PROJECT_DOCS.md](PROJECT_DOCS.md). **No license has been selected for the GAMVerse application source code.** Add a project `LICENSE` before publishing if reuse by others is intended; the asset licenses do not license the application code.
