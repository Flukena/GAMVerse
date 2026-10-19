# GAMVerse

GAMVerse is a self-hosted virtual office that runs in a browser. Members share a 2D or 3D campus, claim private workrooms, meet in shared spaces, and talk through room or proximity-based audio. The project is an active prototype; the included production Compose profile has not been validated as a public deployment.

## Features in this repository

- Account registration and sign-in, office invitations, office-scoped owner/admin/member roles, and a separate maintainer portal.
- Platform operations for maintainers: account recovery, account role management and suspension, office-management audit history, and an aggregate system health overview.
- A server-authoritative multiplayer world with movement, collision, presence, room zones, automatic travel, vehicles, and seats.
- Spacebar jumps in 3D view; jumps are shared with other players and do not bypass ground collision.
- A campus map generator driven by total people and team count. New offices offer a furnished starter using existing assets or empty interiors; saved offices keep their contents. Office owners and admins can edit room zones, doors, spawn point, and roads; office members can edit props and their interactions. Each member can claim one private workroom through a stable desk identity. Ownership survives room movement; deleting a desk retires that identity, and return-to-desk resolves the current owner and geometry on the server.
- The admin desk manager lists current members, including offline members, and supports assigning an empty desk, unassigning its owner or moving an assignment to another vacant desk. Changes recheck role, membership and current ownership, with conflict reload and affected-member notices. Occupied desks are never implicitly replaced.
- A full top-down 2D play view (M toggles 2D/3D) alongside Three.js avatars, with labelled rooms, patterned wood/carpet/tile floors, shaded top-down furniture and foliage, catalog preview fallbacks, selected full-body characters with directional idle/walking/seated sprites, characters that scale naturally with 2D zoom, smoother paced walking and readable screen-sized names, collision-aware bounded name labels and foreground speaking/raised-hand indicators, a minimap on the left and player locate controls. The 2D presentation selector offers Simplified, Immersive and Auto; Auto switches detail with stable zoom thresholds, and manual choice persists on this device. Both views use the same server-owned movement and media membership. Kenney, Quaternius, Poly Pizza, a curated 22-model Polygonal Mind CC0 avatar subset, six KayKit Adventurers CC0 characters, and 68 Gobkit CC0 pets are served from the client package.
- A persistent Office/People/Chat/Activity rail, main-menu office switcher, and per-device Light/Dark/System appearance using the GAMVerse navy, cyan and yellow palette. Owners, admins and maintainers can open Share office to create reusable, seven-day member links, copy them or revoke active links. Recipients sign in before joining; one-use and username invitations remain available in Manage office. Sign out in the lobby or office asks for confirmation; Cancel and Escape keep you signed in. Settings use native modal focus and Escape behavior; guide keyboard focus stays inside its card, and command search closes with one Escape even after typing. Cmd/Ctrl+K searches live people, rooms and workspace actions. The People directory includes offline members and shares person actions with map selection; offline members can receive direct messages. Direct 2D zoom/recenter/desk controls remain available. Chat has channel labels, remembered DM selections, message metadata, and a multiline composer (Enter sends; Shift+Enter adds a line).
- Nearby chat, persisted office and direct-message threads, emoji reactions from the bottom dock picker, and a hand-raise toggle beside reactions in the dock. Office and direct messages share a 10,000-message retention pool per office.
- Member-editable prop notes, HTTPS links, and embeds for YouTube, Google Docs/Slides, Figma, Miro, and Excalidraw. Links show their destination hostname before opening.
- Owner/admin spotlight controls with a separate office-wide media session and explicit speaker publishing consent.
- Avatars turn along the shortest angle. First-person aim controls facing while standing or strafing, and switching to third person keeps the view direction; seats and vehicles retain their facing rules.
- Camera follow smooths both position and aim in the orbit frame. V toggles third-person and first-person views in 3D and is ignored in explicit 2D. Wheel and toolbar zoom keep the selected 3D or 2D view; use the mode control or M to switch views. Third-person view starts behind the character and follows their facing direction. While heading lock is on, W/S walk along the character's facing and holding A/D turns in 15° steps. Right-drag releases heading lock; the separate camera-lock action toggles it, and Focus character recenters without changing the lock setting. Hold G to pass through props and cars when prompted; walls and locked rooms remain solid. The view keeps the selected zoom while walls, doors, and collision props blocking the avatar fade temporarily. Crossing doorways or media zones preserves zoom, elevation and view mode; reduced motion and world/view changes snap. First-person pitch is limited to ±75°.
- Person details use a nonmodal profile panel so viewing someone does not stop walking or automatic travel. Soft local footsteps follow actual movement in both 2D and 3D; Settings → Sound → Walking sounds controls the saved preference. Seated, driving, paused, hidden and deafened states remain silent.
- Entering an office goes directly into the office with microphone and camera off by default. Sound settings include microphone level testing and input/output selection; Camera settings include camera selection and private preview, with background blur or a built-in office image.
- LiveKit audio for meeting rooms, private rooms, and nearby groups with automatic voice recovery, preserved microphone intent, and a manual reconnect control, plus camera and screen sharing controls.
- Server-authorized conversation snapshots drive media targets and a participant-first Meeting view. Camera-off participants stay visible; grid, pin, active-speaker and screen selection change presentation while the existing audio session remains connected. Screen shares have Fit and 100–300% zoom controls. Raised hands appear in server-confirmed conversation order; lowering and re-raising moves a hand to the end. Token grants recheck office/session access and the exact conversation target before and after issuance.
- Talk and AV shortcuts live under Account and settings → Settings → General. The Talk panel lists public conversations and offers server-routed approach, Listen, Join and media-off controls. Listen requests a subscriber-only token and clears publishing intent; Join does not unmute automatically. Walking into a server-confirmed conversation joins automatically by default, without enabling microphone or camera. The automatic-join preference and explicit Listen/media-off choices persist for their existing scopes. Meet and Invite to join me requests support accept, decline, cancel and expiry, with server-validated public walking routes.
- Room privacy in Talk supports server-authorized locking, knocking, admission and revocation. Knocks expire after 30 seconds and guest access after 10 minutes. Changes rotate the room's media epoch; revoked guests lose private audio/chat access, and a failed media transition exposes a retry. New guest admissions start muted. Existing occupants retain microphone intent, but camera and screen sharing stop across an epoch change, including admission or departure, and require explicit re-enabling. Existing desk-owner and meeting-occupant permissions apply.
- Account edits preserve the office session; transient realtime drops attempt to resume the reserved session before automatically joining again.
- Per-device idle-animation preference and office-persisted availability with custom text, emoji and expiry. Busy, In meeting and Away suppress automatic media and interruptions while leaving movement available; returning to Available keeps microphone/camera off until explicitly enabled.
- Authoritative travel progress, cancel and failure feedback. Destination markers are hidden after replacing an active route or a response timeout until the office session resets, because the existing route protocol has no request identifiers.
- A voice roster shows nearby or same-zone participants, their status, and active microphone, camera, and screen-share tracks. Camera/screen buttons open full-screen video; each participant can adjust another member's playback volume or mute that member's published track in their current voice zone. Office owners/admins can mute a media source for everyone in their current zone.
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

