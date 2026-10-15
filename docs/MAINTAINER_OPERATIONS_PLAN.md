# Maintainer operations plan

## Goal

Give platform maintainers enough visibility and safe controls to support users and diagnose problems, while keeping authorization in the API and avoiding sensitive data in logs.

## Phase 1 — Account and office audit trail

- [x] Persist a bounded, searchable-by-filter audit trail for sensitive maintainer actions: issuing password reset links, changing office names and member roles, removing members, and deleting offices.
- [x] Record actor, action, target type/id, timestamp, and a small allowlisted metadata object. Never record reset tokens, passwords, session identifiers, full request bodies, or media data.
- [x] Add a maintainer-only API to list recent audit entries with bounded pagination and optional action/target filters; retain at most 10,000 newest entries.
- [x] Add an audit activity panel to the maintainer lobby with clear empty/loading/error states, action/target filters, pagination, and readable timestamps.
- [x] Add unit coverage for query bounds, parameterization, metadata redaction, and retention. QA statically verified the maintainer check; live HTTP authorization and PostgreSQL persistence remain unverified without Compose.

## Phase 2 — Account safety controls

- [x] Add a maintainer action to suspend/reactivate an account and revoke its active sessions when suspended. Suspending also requests a kick from all active realtime offices; a failed kick is surfaced while preserving the suspended status.
- [x] Let maintainers grant or remove another account's platform maintainer role. Revoke persisted sessions and kick active realtime sessions after a change, prevent self-role changes and demotion of the last active maintainer, and record the change in the bounded audit trail.
- [x] Prevent suspended users from signing in, refreshing session identity, and joining realtime rooms. Preserve data and office ownership; do not hard-delete accounts. Suspension fails closed if PostgreSQL/audit storage is unavailable and prevents self-suspension or suspending the last active maintainer.
- [x] Record suspension/reactivation in the audit trail and show account status, last activity, recovery links, confirmation, and action feedback in the maintainer account panel.
- [x] Add server tests for the fail-closed path and client UI states are implemented; DB-backed success and live disconnect remain unverified without Compose.

## Phase 3 — Developer and system operations visibility

- [x] Add a maintainer-only `/maintainer/overview` endpoint with API/database/realtime readiness, safe account/office/activity aggregates, active realtime room and participant counts, and a bounded 15-minute structured-error count.
- [x] Protect the internal realtime metrics endpoint with the existing constant-time internal-service-token check; return aggregate counts only.
- [x] Keep secrets, user content, exact movement, and raw media out of the overview. Access is maintainer-session-only and responses are `no-store`; activity counts use the existing 24-hour cleanup, while error buckets are in-memory for at most 15 minutes.
- [x] Document access and measurement limits. Realtime counts are process-local; structured error counts cover only `logServerError`, live in memory, and reset on restart. This endpoint is not a substitute for durable metrics, tracing, alerting, or multi-host aggregation.
- [ ] Validate the dashboard against the local Compose stack and document QA results.
  - QA (2026-10-15): Compose services were running; `/health/ready` returned `200 ready`, and unauthenticated `/maintainer/overview` returned `403` as expected.
  - Follow-up (2026-10-15): Promoted the existing local account using the README procedure and verified its maintainer role through `/auth/me`. The user still needs to sign in through `/maintainer`; the authenticated overview/cards and refresh remain unverified in a maintainer session.
  - Browser check (2026-10-15, `https://gammyverse.lan:5173`): the existing regular-user session could open an office, but `/maintainer` showed “This account is not a maintainer account.” A direct authenticated GET to `https://gammyverse.lan:2567/maintainer/overview` returned `403` with “Maintainer access required.” This verifies regular-user denial only; there was no maintainer session to verify the dashboard. `localhost` is not the configured TLS hostname (`DEV_HOST`), so its TLS alert is not evidence of a Caddy TLS outage.
  - The Compose `office-dev` service bind-mounts the current checkout at `/workspace`. SHA-256 hashes for `OfficeRoom.ts`, `auth.test.ts`, and `officeSessionSecurity.test.ts` matched between host and container, so the earlier test discrepancy was not a stale source/image.
  - Reproduced the container failures with its inherited runtime environment: 85/90 passed. The two auth failures were caused by Compose PostgreSQL settings directing tests at the live dev database (including an existing office-owner constraint); three reconnect tests expected `http://localhost:5173` while Compose sets `CLIENT_ORIGIN` to HTTPS origins. Running the server suite in the container with DB connection variables unset and `CLIENT_ORIGIN=http://localhost:5173` passed all 90 tests. This isolates the filesystem-backed auth tests and lets office tests use their mocked DB boundary.
  - In the Compose container, client `tsc --noEmit` and `vite build` both passed. Vite completed in 1m 2s; it emitted the existing large-chunk warning. The earlier report of a stalled build was an observation timeout, not a failed build.
  - Acceptance remains open until the dashboard is verified with an existing maintainer-authenticated browser session.

## Delivery and verification

Each phase is a reviewable PR and leaves the product playable. Use numbered SQL migrations registered in `initializeDatabase()`. Run the package build and relevant server tests; QA records browser/API steps and results. Do not change production deployment configuration or add external services without owner approval.
