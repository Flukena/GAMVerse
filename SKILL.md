---
name: gamverse-project
description: Repository guide for implementing and documenting the GAMVerse browser office.
---

# GAMVerse project skill

Use this guide when changing this repository. `README.md` is the public entry point; the **Current implementation** section of `PROJECT_DOCS.md` describes the live architecture. The later source-document archive preserves earlier decisions and progress notes and may describe superseded behavior. Check current code before relying on an archived statement.

## Find the owner of a change

| Concern | Start here |
| --- | --- |
| Accounts, sessions, custom avatars | `packages/server/src/auth/` |
| Office membership, map and prop persistence, invites | `packages/server/src/offices/repository.ts` |
| Movement, auto travel, seating, vehicles, zones and presence | `packages/server/src/offices/OfficeRoom.ts` |
| HTTP API and realtime process setup | `packages/server/src/entrypoints/` |
| LiveKit token grants | `packages/server/src/media/service.ts` |
| Shared geometry, collision, prop catalog, generator | `packages/shared/src/` |
| React routes, office controls, editor, media UI | `packages/client/src/ui/` |
| 3D and 2D camera/world rendering | `packages/client/src/world/` |
| Frontend asset paths and loaders | `packages/client/src/assets/` |
| Database changes | `packages/server/migrations/` and `packages/server/src/infra/db.ts` |

## Keep these contracts intact

- The browser sends movement intent. The Colyseus room owns positions, collision, room/voice membership, and results broadcast to other clients.
- Put shared map shapes, prop definitions, and collision calculations in `packages/shared`. Keep the client preview and server walkability consistent.
- Office map geometry and office props have separate versioned persistence paths. Preserve both when editing map save flows; a stale map draft must not erase newer props.
- Check office membership and role on the server for every persistent or media action. Do not treat a route, room name, or client coordinate as authorization.
- Load runtime models from `packages/client/public/assets` through frontend asset helpers. `packages/client/assets` contains larger source packs. Keep each third-party license notice with its assets.
- Use a new SQL migration for schema changes and register it in `initializeDatabase()`; do not rewrite an applied migration.
- Preserve the API/realtime process split and private internal-service token boundary.

## Work sequence

1. Read the relevant implementation and its shared/server/client call sites. Search with `rg` before changing behavior.
2. Make the smallest coherent change at the module that owns the rule. Update adjacent callers and data validation when a contract changes.
3. Run `pnpm build` for cross-package TypeScript and production-bundle checks. Use targeted tests or browser checks when behavior needs them; document what was actually verified.
4. Update `README.md` for setup or public behavior changes, and the current section of `PROJECT_DOCS.md` for architecture or durable decisions. Do not add another project-wide Markdown document.

## Local environment

- `docker compose up -d` runs PostgreSQL, LiveKit, API, realtime, Vite, and Caddy together. The default URL is `https://localhost:5173` with Caddy's local certificate.
- `.env`, `.env.production`, local certificate files, test output, and dependency backups are private/generated. Keep them out of commits.
- `pnpm dev` alone omits the database, LiveKit, and reverse proxy; use Compose for end-to-end office behavior.
- The repository has no project source-code license yet. Preserve existing third-party license files and ask the owner to choose an application license before an open-source release.

