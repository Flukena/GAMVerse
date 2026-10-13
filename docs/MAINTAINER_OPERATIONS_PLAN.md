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
- [x] Prevent suspended users from signing in, refreshing session identity, and joining realtime rooms. Preserve data and office ownership; do not hard-delete accounts. Suspension fails closed if PostgreSQL/audit storage is unavailable and prevents self-suspension or suspending the last active maintainer.
- [x] Record suspension/reactivation in the audit trail and show account status, last activity, recovery links, confirmation, and action feedback in the maintainer account panel.
- [x] Add server tests for the fail-closed path and client UI states are implemented; DB-backed success and live disconnect remain unverified without Compose.

## Phase 3 — Developer and system operations visibility

- [x] Add a maintainer-only `/maintainer/overview` endpoint with API/database/realtime readiness, safe account/office/activity aggregates, active realtime room and participant counts, and a bounded 15-minute structured-error count.
- [x] Protect the internal realtime metrics endpoint with the existing constant-time internal-service-token check; return aggregate counts only.
- [x] Keep secrets, user content, exact movement, and raw media out of the overview. Access is maintainer-session-only and responses are `no-store`; activity counts use the existing 24-hour cleanup, while error buckets are in-memory for at most 15 minutes.
- [x] Document access and measurement limits. Realtime counts are process-local; structured error counts cover only `logServerError`, live in memory, and reset on restart. This endpoint is not a substitute for durable metrics, tracing, alerting, or multi-host aggregation.
- [ ] Validate the dashboard against the local Compose stack and document QA results.

## Delivery and verification

Each phase is a reviewable PR and leaves the product playable. Use numbered SQL migrations registered in `initializeDatabase()`. Run the package build and relevant server tests; QA records browser/API steps and results. Do not change production deployment configuration or add external services without owner approval.
