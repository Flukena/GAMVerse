# GAMVerse agent rules

This is the single rulebook for coding agents (Claude, Codex) and contributors. `CLAUDE.md` only imports this file. Product and architecture background: `README.md` and the **Current implementation** section of `PROJECT_DOCS.md`. The archived sections of `PROJECT_DOCS.md` may describe superseded behaviour, so check the code before relying on them.

## Commands

| Task | Command |
| --- | --- |
| Full local stack (Postgres, LiveKit, API, realtime, Vite, Caddy) | `docker compose up -d` → https://localhost:5173 |
| App processes only (no DB, LiveKit or proxy) | `pnpm dev` |
| Type check + production bundles (all packages) | `pnpm build` |
| Shared tests | `pnpm test` (runs `packages/shared/src/index.test.ts` only) |
| Server tests | `pnpm --filter @gammyverse/server test` (runs `src/auth.test.ts` only) |

- The tooling is pinned to pnpm 11.25.0 (`packageManager`). If `pnpm` is not on PATH, use `corepack pnpm`. Dependencies are normally installed inside the dev container.
- Each package's test script names its test files explicitly. **A new `*.test.ts` file does not run until you add it to that package's `test` script.**
- Some tests are known to fail already. See `docs/PERFORMANCE_REVIEW.md` (P1, test baseline). Report new failures separately from these.

## Where code goes

| Concern | Owner |
| --- | --- |
| Accounts, sessions, custom avatars | `packages/server/src/auth/` |
| Office membership, map and prop persistence, invites | `packages/server/src/offices/repository.ts` |
| Movement, auto travel, seating, vehicles, zones, presence | `packages/server/src/offices/OfficeRoom.ts` |
| HTTP API and realtime process setup | `packages/server/src/entrypoints/` |
| LiveKit token grants | `packages/server/src/media/service.ts` |
| Shared geometry, collision, movement math, prop catalog, map generator | `packages/shared/src/` |
| React routes, office controls, editor, media UI | `packages/client/src/ui/` |
| 3D/2D world rendering and camera | `packages/client/src/world/` |
| Frontend asset paths and loaders | `packages/client/src/assets/` |
| Database schema | `packages/server/migrations/` + registration in `packages/server/src/infra/db.ts` |

### Structure rules for new code

- **Do not grow the god-files.** `client/src/world/WorldCanvas.tsx`, `client/src/ui/OfficeApp.tsx`, `server/src/offices/OfficeRoom.ts` and `shared/src/roomLayout.ts` are already very large. Put new logic in a new focused module next to them (for example `client/src/world/camera/`) and import it. When you change a block inside a god-file, extract it if the change allows.
- **Pure logic belongs in `packages/shared` or a standalone module, not in a React component or a render loop.** Math, validation, state transitions and geometry must be functions you can test without Three.js scenes, React or Colyseus.
- **If both client and server use a rule, it lives once in `packages/shared`.** Never copy collision, movement or catalog logic into one side.
- **Dependencies point one way:** `client` and `server` → `shared`. `shared` imports neither. Inside the client, `ui/` may render `world/`, but `world/` must not import `ui/`. Pass state down as props/refs (the existing `cameraYawRef` pattern) instead of upward callbacks that reach into the owner.
- **Name tunables as constants with units** (for example `FPP_FOV_DEG`, `POLL_INTERVAL_MS`) at the top of the module, or in `CAMERA`/`WORLD` in shared when both sides use them.
- **Tests sit next to the module** (`foo.ts` + `foo.test.ts`) and are registered in the package `test` script.

## Contracts to keep

- The browser sends movement intent. The Colyseus room owns positions, collision, facing, room/voice membership and the results broadcast to other clients. Never trust client coordinates.
- Check office membership and role on the server for every persistent or media action. A route, room name or client value is not authorization.
- Map geometry and office props have separate versioned persistence paths. A stale map draft must not erase newer props.
- Every message payload is validated in `shared` (for example `isValidMovementInput`) before the server uses it. Extend the validator in the same change that adds a field.
- Schema changes go in a new numbered SQL migration plus its `initializeDatabase()` entry. Never edit an applied migration.
- Load runtime models from `packages/client/public/assets` through the asset helpers. `packages/client/assets` holds source packs. Keep every third-party license notice with its assets.
- Keep the API/realtime process split and the private internal-service token boundary.

## Plans and docs

- Multi-phase work gets a plan in `docs/` before coding. Each phase is one PR and leaves the game playable.
- Current plans:
  - `docs/CAMERA_VIEW_PLAN.md` — character camera, view modes and avatar facing
  - `docs/PERFORMANCE_REVIEW.md` — infrastructure and performance findings
- Update `README.md` for setup or public behaviour changes, and the current section of `PROJECT_DOCS.md` for durable architecture decisions. Do not start other project-wide Markdown files outside `docs/`.

## Verifying work

- `pnpm build` must pass for any TypeScript change.
- Behaviour changes need a test that fails when the change is reverted, or a stated browser check.
- Multiplayer behaviour (movement, facing, presence, voice zones) is verified with two browser sessions on the Compose stack. Say which checks were run and which were not.

## Ask the owner first

Production deploys and `compose.production.yaml`/`Caddyfile` changes, secrets and `.env*` files, data deletion or volume removal, applied migrations, adding a source-code license, and new third-party asset packs.

`.env`, local certificates, `.loadtest/` output and dependency backups are private or generated. Never commit them.
