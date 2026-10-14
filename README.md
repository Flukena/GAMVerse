# GAMVerse

GAMVerse is a self-hosted virtual office that runs in a browser. Members share a 3D campus, claim private workrooms, meet in shared spaces, and talk through room or proximity-based audio. The project is an active prototype; the included production Compose profile has not been validated as a public deployment.

## Features in this repository

- Account registration and sign-in, office invitations, office-scoped owner/admin/member roles, and a separate maintainer portal.
- Platform operations for maintainers: account recovery and suspension, office-management audit history, and an aggregate system health overview.
- A server-authoritative multiplayer world with movement, collision, presence, room zones, automatic travel, vehicles, and seats.
- A campus map generator driven by total people and team count. Office owners and admins can edit room zones, doors, spawn point, roads, and props. Each member can claim one private workroom.
- Three.js avatars and a client-controlled 2D overview; Kenney, Quaternius, and Poly Pizza assets are served from the client package.
- Avatars turn along the shortest angle. First-person aim controls facing while standing or strafing, and switching to third person keeps the view direction; seats and vehicles retain their facing rules.
- Camera follow smooths both position and aim in the orbit frame. Third-person view keeps the selected zoom while walls, doors, and collision props blocking the avatar fade temporarily. Crossing doorways or media zones preserves zoom, elevation and view mode; reduced motion and world/view changes snap. First-person pitch is limited to ±75°.
- LiveKit audio for meeting rooms, private rooms, and nearby groups with automatic voice recovery, preserved microphone intent, and a manual reconnect control, plus camera and screen sharing controls.
- Account edits preserve the office session; transient realtime drops attempt to resume the reserved session before automatically joining again.
- Per-device idle-animation preference and presence statuses such as Available, Do Not Disturb, and Toilet.

See [PROJECT_DOCS.md](PROJECT_DOCS.md) for architecture, data flow, deployment notes, research, and the preserved project history. [AGENTS.md](AGENTS.md) is the development guide for contributors and coding agents.

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

`pnpm dev` starts the three application processes but does not start PostgreSQL, LiveKit, or the Caddy routing/TLS profile. Use Compose for the full office experience. The root `pnpm test` script runs the shared-package and client connection tests; the server package also has its own test script.

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

