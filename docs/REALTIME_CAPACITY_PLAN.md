# Realtime CPU and capacity plan

Date: 2026-10-20
Status: proposed; implementation and capacity certification are not complete.
Target: establish a measured path toward 200 concurrent users, not a promise
that the current server supports 200 users in one office.

Related: [performance review](PERFORMANCE_REVIEW.md),
[auto-route refactor](AUTO_ROUTE_REFACTOR_PLAN.md), and
[media session plan](MEDIA_SESSION_PLAN.md).

For decisions about worker threads, separate services and client-owned work,
see the [workload separation plan](REALTIME_WORKLOAD_SEPARATION_PLAN.md).

## 1. Objective and invariants

Remove repeated map processing from the realtime hot path, bound expensive
work, and verify correctness and capacity after each change.

- Keep authoritative positions, speed, collision, facing, seating occupancy,
  room membership, permissions, and media grants on the server.
- The browser sends intent, not trusted coordinates or authorization decisions.
- Shared geometry and validation remain in `packages/shared`.
- Extract focused modules instead of growing `OfficeRoom.ts`.
- Preserve map/prop versioning, private-room access expiry, media revocation,
  reconnect behavior, and server-side office membership checks.
- Each phase is one reviewable PR and leaves the game playable.
- Do not increase production room limits or deploy as part of this plan without
  owner approval. Production Compose, secrets, and data deletion remain out of scope.

## 2. Observed baseline and evidence limitations

The investigation used the local Podman development stack, not the production
host. The VM had 6 vCPUs and 2 GiB RAM. One container ran API, realtime, and Vite.
One player was connected during the CPU measurements; movement activity was not
recorded precisely enough to label this an idle-only benchmark.

| Observation | Result |
| --- | --- |
| Fresh CPU-time delta over approximately 10 seconds | Realtime 92.3% of one core; Vite 7.3%; API approximately 0% |
| Approximately 12-second realtime CPU profile | Simulation dominated; two map-parse/zone-lookup branches together accounted for approximately 61% of sampled wall time |
| Saved map dimensions by object count | 5,330 props; 170 zones; 680 walls; 170 doors |
| Prop catalog | 1,508 definitions |
| Zone lookup that reparses the map, 40 calls | p50 15.69 ms; p95 24.40 ms |
| Lookup using already-parsed zones, 40 calls | p50 0.0075 ms; p95 0.0753 ms |
| Seat anchors across every prop, 10 calls | p50 11.39 ms; p95 20.71 ms |
| Indexed catalog and seat props only, 10 calls | 823 seat props; p50 0.32 ms; p95 0.43 ms |
| Rebuilding one collision world, 5 calls | p50 54.62 ms; p95 85.95 ms |

These small microbenchmarks identify expensive operations. They do not measure
end-to-end speedup, production capacity, or 200-user behavior. CPU profile
inclusive percentages overlap and must not be added across parent/child frames.
Raw diagnostic profiles were not retained; rerun a reproducible baseline before
using these observations as a release gate.

### Repeated passive sample (2026-10-20)

On the local Podman development stack, a fresh 10-second `/proc/<pid>/stat`
sample recorded realtime at **92.4% of one core**, Vite at **7.4%**, and API
below the 0.1-second CPU-tick resolution (**0.0% observed**). RSS was 238,864
KB realtime, 168,820 KB Vite, and 131,672 KB API. The authenticated internal
metrics endpoint returned one active room, one participant, and zero recent
errors. No synthetic workload or service restart was used; participant
movement was unknown, so this is a low-activity/unknown sample, not a confirmed
idle benchmark. The running dev container also includes Vite/watchers and its
source/runtime revision was not verified. This remains observational evidence,
not a capacity result.

Repeat procedure: resolve current process IDs from `ps -eo pid,comm,args` inside
`gamverse_office-dev_1`; sample `/proc/<pid>/stat` user+system ticks around a
10-second interval; divide delta ticks by elapsed seconds and `getconf
CLK_TCK`; read `VmRSS`/`VmHWM` from `/proc/<pid>/status`. Sample API, realtime,
and Vite separately, then record `podman stats --no-stream` for aggregate
container and separate LiveKit/Postgres/Caddy context. The office container's
network counters combine API, realtime, and Vite. Do not use the displayed
lifetime-average-style container CPU field as an instantaneous rate.

Earlier `podman stats --no-stream` readings near 26% reflected a lifetime-average
style sample in this environment and understated the fresh realtime load.
Do not compare them directly with instantaneous desktop gauges.

### Exploratory authenticated movement ramp (2026-10-20)

The current dev stack was tested with 200 temporary authenticated Colyseus SDK
clients joining the requested office in increments of 10. Each connected mock
sent movement input at 10 Hz; each level ran for 10 seconds. CPU was calculated
from realtime process `process.cpuUsage()` deltas, so the client generator, API,
and Vite were excluded from that number. Podman container totals still include
the generator and dev services. The clients were not browser-rendering avatars
and did not join LiveKit. All 200 clients disconnected and all temporary account,
session, membership, and activity rows were deleted after the run.

The configured room cap was 150. At 150 mock clients, a second room was created;
at 200, the 200 mocks were split 149/51 across two room instances, plus the one
pre-existing user in the first room. This is not a measurement of 200 people in
one shared room. No clients disconnected during the measured ramp. The 10-second
levels are exploratory only and do not meet the longer warm-up, repeat, or soak
requirements below.

| Mock users | Rooms | Realtime CPU (% of one core) | Realtime RSS (MiB) | Tick p95 (ms) | State patches (KiB/s) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1 | 7.17 | 198.9 | 6.85 | 10 |
| 20 | 1 | 8.38 | 209.5 | 6.89 | 32 |
| 30 | 1 | 7.27 | 202.5 | 6.90 | 56 |
| 40 | 1 | 7.90 | 205.7 | 6.90 | 83 |
| 50 | 1 | 11.20 | 200.6 | 6.95 | 108 |
| 60 | 1 | 10.93 | 205.1 | 7.12 | 142 |
| 70 | 1 | 11.35 | 211.1 | 7.24 | 186 |
| 80 | 1 | 12.93 | 210.9 | 7.54 | 230 |
| 90 | 1 | 12.82 | 223.7 | 7.72 | 230 |
| 100 | 1 | 13.96 | 210.7 | 7.95 | 255 |
| 110 | 1 | 13.92 | 224.9 | 8.06 | 368 |
| 120 | 1 | 15.76 | 226.1 | 8.24 | 361 |
| 130 | 1 | 13.51 | 232.4 | 8.43 | 418 |
| 140 | 1 | 16.59 | 244.6 | 8.72 | 444 |
| 150 | 2 | 16.09 | 221.1 | 8.48 | 418 |
| 160 | 2 | 16.40 | 224.4 | 8.55 | 255 |
| 170 | 2 | 17.01 | 221.7 | 8.46 | 217 |
| 180 | 2 | 18.58 | 220.1 | 8.47 | 180 |
| 190 | 2 | 17.08 | 224.9 | 8.51 | 197 |
| 200 | 2 | 18.74 | 227.4 | 8.53 | 200 |

At 200 mocks, the final 10-second sample also showed tick p99 12.31 ms,
event-loop p95 14.50 ms, patch-cycle p95 2.068 ms, application frames 458.7
KiB/s, and zero measured disconnects. Podman container memory peaked around
930 MiB of 2.04 GiB during the ramp. These results do not certify capacity for
200 users in one shared room, real browsers, or voice/video workloads.

**Metrics caveat:** the room calls `setFixedTimestep(..., 20)`, where Colyseus
interprets `20` as 20 Hz (about 50 ms per tick). Instrumentation version 2 still
labels the expected interval as 20 ms, so `estimatedMissedIntervals` is invalid
and must not be used as a result from this run. The measured tick start-gap
median was about 50.7 ms, matching 20 Hz.

The earlier passive sample used a process with the old implementation, despite
changed source files on the bind mount. The exploratory ramp below later
confirmed instrumentation version 2 and increasing `stationaryTickSkips` in the
running process, but did not compare the optimization against an old build or
verify the complete artifact hash. The position-only spatial refresh gate also
needs revision: access expiry and other non-position updates must continue while
everyone is stationary.

## 3. Main workstreams

| Priority | Work | Current cost or scaling risk | Intended treatment |
| --- | --- | --- | --- |
| P0 | Zone lookup reparses the entire map | Props are normalized and catalog-scanned to answer a zone query | Parse once per map revision; query parsed zones |
| P0 | Auto-sit scans all props and catalog entries | Repeated work for stationary players | Cache seat metadata; spatial index; bounded scans |
| P1 | Vehicle collision rebuild | Full map/world reconstruction, including per-driver worlds | Static collision plus incremental dynamic overlays |
| P1 | Synchronous route search | A search budget permits up to 500 ms on the event loop | Bounded queue, room-wide admission, worker execution |
| P1 | Proximity and conversation reconciliation | Pairwise checks and repeated projections/clones | Spatial neighbors, dirty flags, explicit deadlines |
| P2 | Whole-room state fanout | Movement delivery grows with players and recipients | Separate office presence from detailed spatial interest |
| P2 | Browser processing of snapshots | Full snapshot rebuilds, signatures, and repeated audio lookups | Incremental indexes and presentation-only client work |

## 4. Process workflow

For every phase:

1. Record the commit/worktree diff, runtime code version, map fixture counts,
   hardware, deployment mode, participant activity, and measurement interval.
2. Reproduce the problem and capture baseline metrics before editing.
3. Add characterization/regression tests against actual room integration seams,
   not only helper mocks or internal timer values.
4. Implement the smallest complete change; wire invalidation and cleanup.
5. Run focused tests, then build. Escalate to related package suites when the
   shared contract, lifecycle, or authorization path changes.
6. Prove the relevant regression test fails with the fix removed or a targeted
   mutant. Use an isolated copy; never mutate a live bind-mounted checkout.
7. Obtain independent review. Resolve correctness findings before benchmarking.
8. Verify two-browser multiplayer behavior on the local Compose/Podman stack.
9. Run before/after benchmarks using the same fixture and workload.
10. Record pass/fail/skip counts, metrics, limitations, and rollback instructions
    in this document. An unrun check stays explicitly unverified.

Do not count a passing build, a health endpoint, or synthetic socket joins as
proof of playable multiplayer or media quality.

## 5. Implementation phases

### Phase 0: reproducible instrumentation and baseline

- Measure per-process CPU deltas and separate API, realtime, Vite, LiveKit, and DB.
- Collect tick duration p50/p95/p99/max, missed deadlines/catch-up work,
  event-loop delay, room/player counts, RSS, and network bytes.
- Include route queue depth/search duration, map parsing/world rebuild counts,
  seat candidates examined, proximity pair checks, and state patch bytes.
- Aggregate metrics at low frequency; do not emit one log per player per tick.
- Verify the loaded runtime matches the checkout. A mount change alone is not
  proof that watchers reloaded it. Restart local processes deliberately and
  record the interruption; do not silently restart a shared environment.
- Benchmark production bundles without Vite/watchers on a test stack. Keep
  development startup/install measurements separate from steady-state load.

Exit: baseline can be repeated with a documented workload and consistent units.

### Phase 1: parsed map and seating indexes

- Replace hot-path map parsing with queries against the room's parsed layout.
  Keep validation at load/update boundaries.
- Build catalog-by-asset and seat metadata indexes once, preserving catalog
  resolution, seat identifiers, geometry, rotation, and tie-breaking semantics.
- Search nearby seats rather than every prop. Bound scans without skipping
  facing updates or other tick work.
- Invalidate indexes on accepted map/prop revisions. Reset per-session pending
  work on movement, teleport, disconnect, replacement, and reconnect as needed.
- Rework the earlier uncommitted patch rather than shipping its position-only
  refresh gate unchanged.

Tests:

- Parsed zone queries match existing entry/exit hysteresis and overlapping-zone
  selection, including room locks and map updates.
- Stationary ticks do not normalize the whole map or scan the whole catalog.
- Auto-sit delay/radius, seat occupancy, rotated benches, stand-up movement,
  map edits, and reconnect behavior remain correct.
- A second player occupying a pending seat cannot produce double occupancy.

Exit: no full map parsing in steady-state movement/zone ticks; record actual
single-player CPU and tick improvement, not just helper benchmark improvement.

### Phase 2: spatial refresh and time-driven work

- Separate movement simulation from spatial membership/proximity projections.
- Use dirty revisions for changed positions, presence, status, membership,
  map geometry, access policy, and media generation.
- Give admission expiry, knock expiry, retained-empty locks, public discovery,
  and availability enforcement explicit timers/deadlines independent of motion.
- Coalesce work per room while preserving immediate security-sensitive changes.
- Use spatial buckets for proximity; preserve hysteresis, group continuity,
  membership-derived grants, and retired-group revocation.

Tests:

- Differential neighbor/group results versus the existing algorithm.
- Stationary access/knock expiry occurs without movement or incoming messages.
- Stationary status changes, lock changes, suspension, media generation changes,
  and reconnects update the correct recipients.
- Boundary crossing, rapid regrouping, and disconnect cleanup with two clients.

Exit: lower candidate-pair counts and bounded projection frequency with no
stale permissions or stalled expiration behavior.

### Phase 3: static and dynamic collision

- Keep static geometry/indexes by map revision.
- Represent moving/parked vehicles in a dynamic index; exclude only the
  authoritative driver's own vehicle where required.
- Cache or incrementally update access overlays by relevant policy revision.
- Avoid reconstructing the entire world for every driver on every movement tick.

Tests: two drivers, walking around moving/parked vehicles, safe dismount,
teleport, locked-zone entry, map changes, collision grid invalidation, and
existing ghost-mode behavior.

Exit: moving vehicles no longer trigger full-map reconstruction each tick.

### Phase 4: bounded pathfinding

- Establish per-room/process concurrency, queue size, cancellation, and fair
  per-session admission in addition to existing request throttling.
- Move expensive search to a worker with versioned immutable geometry.
- Reject stale results after intent changes, map/access changes, disconnects,
  or session replacement; revalidate before committing movement.
- Return explicit queued/busy/cancelled outcomes using repository conventions.
- Preserve destination, seat approach, follow, collision, and access semantics.
- Client-proposed routes are optional later work, not a prerequisite.

Tests: queue saturation, cancellation, stale worker results, worker failure,
blocked destinations, long detours, simultaneous follows, and seat contention.

Exit: expensive searches do not block the main realtime event loop; no unbounded
queue, starvation, or stale route commit.

### Phase 5: replication and optional client assistance

- Measure patch bytes and encode/send time before changing replication.
- Keep office-wide presence/people discovery separate from nearby detailed
  transforms; define distant map-marker semantics before interest filtering.
- Preserve spotlight, conversation discovery, reconnect snapshots, and privacy.
- Optionally add client prediction with authoritative reconciliation.
- Optionally compute proposed routes in a browser Web Worker, but validate
  bounded payloads, map revision, speed, collision, and permissions server-side.
- Optimize existing client snapshot/audio indexes; do not move expensive loops
  to the browser without measuring frame time.

Exit: documented behavior changes, browser tests, and measured bandwidth/CPU
improvement without missing participants or unauthorized media access.

## 6. Client/server responsibility boundary

| Concern | Client may own | Server must retain |
| --- | --- | --- |
| Movement | Prediction, interpolation, input presentation | Accepted position, speed, collision, facing |
| Navigation | Preview or proposed route search in a worker | Validation and authoritative execution |
| Seating | Nearby suggestion/highlight | Occupancy, distance/access validation, final seat |
| Voice | Playback gain, local UI, subscription presentation | Membership, authorization, token grants/revocation |
| Visuals | Animation, footsteps, particles, camera, LOD | Validation of events with shared gameplay effects |
| Map editing | Draft preview and local validation feedback | Role checks, versioned persistence, accepted geometry |

## 7. Test and verification matrix

Run each scenario at 1/10/25/50 users, then 100/150/200 only after lower stages
pass. Use separately approved test-room limits; never raise production limits
to make a benchmark join succeed.

| Scenario | Required behavior and measurements |
| --- | --- |
| Empty office | Room disposal; no leaked timers, workers, or queued routes |
| Stationary users | Auto-sit and expiry remain correct; no hot-path parsing |
| Mixed workload | Fixed reproducible idle/walking/auto-route ratios |
| All walking | Realistic input cadence; tick latency, CPU, patches, bytes |
| Auto-route/follow bursts | Queue fairness, cancellation, event-loop delay |
| Vehicles | Multiple drivers; dynamic collision; safe dismount |
| Dense/sparse proximity | Candidate pairs, group churn, media revocation |
| Join/reconnect bursts | Auth/DB latency, replacement semantics, initial map size |
| Map edit with users | Versioning, cache invalidation, stale route rejection |
| Media | Separate microphone/camera/screen workloads and TURN conditions |

Use a fixed workload seed and sanitized map fixture. Load clients must run
outside the measured server resources where possible. Record generator CPU
and errors so an overloaded generator cannot create a false pass.

Warm up for 2 minutes, measure for at least 10 minutes per stage, repeat three
times, and run a 30-minute soak at the highest candidate capacity.
Stop escalation on correctness errors, sustained overload, or queue growth.

### Proposed acceptance gates

These are release targets to validate, not achieved results:

- Simulation work: p95 <= 10 ms; p99 <= 20 ms for the 20 Hz timestep (50 ms).
- Event-loop delay p99 <= 20 ms during steady-state movement.
- At least 30% headroom on the busiest realtime execution thread; aggregate
  host CPU alone cannot establish this for a single Node.js event loop.
- No sustained route backlog, tick catch-up spiral, crashes, or incorrect access.
- No new unexpected disconnects; report join/reconnect latency and failures.
- No monotonic retained-memory growth after repeated join/leave cycles.
- No regression in seat ownership, collisions, private grants, or map persistence.
- Report input-to-authoritative-update and browser frame-time percentiles on
  real clients; agree deployment-specific latency/FPS targets before certification.

If a gate cannot be met, lower the supported cap or change the architecture.
Do not hide overload by merely increasing message limits or skipping authority.

## 8. Commands and evidence

Use the package scripts as they exist at implementation time. New adjacent test
files must be registered in the owning package's explicit test script.

```sh
# Example focused test selection; extend for the phase being changed.
pnpm --filter @gammyverse/server exec tsx --test \
  src/offices/availabilityMovement.test.ts \
  src/offices/privateMovement.test.ts

# Required for TypeScript changes.
pnpm build

# Run when the phase changes these shared/lifecycle contracts.
pnpm test
pnpm --filter @gammyverse/server test

git diff --check
```

Check the client package's current test script for client changes. Establish
fresh test counts; historical failures in the performance review are not a
substitute for a current baseline.

Store diagnostic outputs outside committed source. Never commit `.loadtest/`
outputs, credentials, session tokens, private office maps, or `.env*` files.
Close temporary inspectors/profilers and confirm readiness after diagnostics.

Record for every phase:

| Field | Required content |
| --- | --- |
| Revision/runtime | Commit or diff identifier; loaded-code confirmation |
| Environment | Hardware, Node/pnpm versions, limits, build mode |
| Workload | Fixture counts, users, activity mix, seed, duration |
| Automated tests | Before/after pass/fail/skip, regression proof |
| Runtime metrics | CPU deltas, tick/event-loop percentiles, RSS, bytes |
| Browser verification | Two-session checks run and explicitly unrun |
| Review | Reviewer, findings, fixes, unresolved risks |
| Decision | Pass, block, or supported-cap reduction |

## 9. Rollout and capacity decision

- Validate in a dedicated test stack before staging or production changes.
- Roll back a phase on incorrect membership, collision, stale routes, expired
  access remaining active, or measurable latency/CPU regressions.
- Keep existing supported limits until the staged matrix and soak pass.
- Distinguish 200 users across multiple offices from 200 in one shared office.
  Multiple realtime processes require explicit shared presence/control routing;
  adding replicas does not automatically split one room's simulation.
- Publish a capacity statement tied to hardware, map, activity, and media
  profile. If 200 in one room fails, document the measured limit and choose
  further optimization or an explicitly designed partitioning strategy.

## 10. Execution status

- [x] Initial live CPU profile and map microbenchmarks collected.
- [x] Temporary inspector closed; realtime readiness returned HTTP 200.
- [x] Plan documented.
- [ ] Phase 0: passive baseline and instrumentation added; deliberate runtime verification and repeatable workload remain.
- [x] Phase 1: parsed map/seating indexes implemented and independently reviewed; focused tests and isolated regression mutants pass.
- [x] Phase 2 implementation: bucketed proximity broad phase, 100 ms stationary projection cadence, independent access/discovery/availability deadlines, immediate access/media updates, and lifecycle cleanup implemented and independently reviewed.
- [ ] Phase 2 runtime gate: two-browser verification and before/after loaded measurements remain.
- [x] Phase 3 implementation: static collision cached per map revision, dynamic vehicle grid updated once after movement, and own-vehicle exclusion preserved; independent review passed.
- [ ] Phase 3 runtime gate: two-browser verification and before/after collision workload measurements remain.
- [x] Phase 4 implementation: bounded process-wide worker pool, worker bundle/path resolution, static geometry snapshots with per-request vehicle/access overlays, queue/cancellation limits, and stale-result fencing. Auto-move, move-to-player, initial follow/repaths, seat approach/fallback, public-conversation approach, and meeting-room planning use workers. Results recheck active sessions, intent, map/access revisions, participant/target state, live collision, and zone availability before commit. Focused regression suites pass and independent review found no remaining issues.
- [x] Phase 5 initial server optimization: idle players skip per-tick movement/collision work between seat scans; fresh facing input, seat scans, and independent spatial/security deadlines remain active. A process counter records skipped stationary work.
- [x] Phase 5 measurement hooks: aggregate patch-cycle encode/enqueue duration, outgoing state-patch/snapshot/application-frame bytes, client snapshot processing time, and render callback duration. No user identifiers are included.
- [x] Phase 5 initial replication: Colyseus views send precise coordinates for the local player and players within 100 world units; office-wide distant markers update once per second. The shared people/presence list remains available.
- [ ] Phase 5 runtime gate: verify two-browser interest boundaries, reconnect snapshots, minimap markers, and privacy; capture comparable patch bytes/CPU before and after and tune the 100-unit radius if needed.
- [ ] Two-browser regression verification.
- [ ] Staged load tests and capacity decision.
- [ ] Owner-approved production rollout.

Verification on 2026-10-20: `pnpm build` passed (the existing client chunk-size
warning remains). The latest full server suite reported 326/331 passing. Its
five failures were the real-SDK room-deletion deadline test, two
`creationProps.test.ts` cases, and two `seatApproachRoute.test.ts` cases. A clean
before-change full suite was not captured, so these failures are not labeled
regressions or proven pre-existing. The current shared suite reported 95/97:
the fifty-seat/townhall campus furnishing case and chair/sofa footprint
assertion failed. Client tests
reported 359/362 (two `voiceRoomSession.test.ts`
failures and one `map2dPresentationDrawing.test.ts` failure). Phase 1 focused
room/index tests passed 10/10; isolated mutants failed 1/9 each for raw-map zone
parsing and missing map-index invalidation. Phase 0/1-focused tests passed
14/14. The complete Phase 2 focused suite passed 23/23; targeted scheduling
mutants produced four failures. Phase 3 collision, Ghost, access-overlay and
dismount tests passed 14/14, including the dynamic-only shared-world regression;
independent review found and verified the fallback fix. Targeted mutants for
Phase 3 were not run.
Coverage includes seeded neighbor differential checks, recipient notifications
and LiveKit revoke calls, stationary expiry without ticks/messages, timer
cleanup, grant denial, epoch rotation, and retained lock release. A one-second
idle histogram probe at 10 ms resolution measured p50 11.04 ms and p99 13.28 ms
on the local host; this characterizes measurement granularity only, not loaded
event-loop delay. At that point the running realtime process still lacked the
`runtime` metrics fields; a later exploratory load run confirmed version 2 was
loaded. Two-browser verification and controlled before/after measurements
remain unrun; Phase 0 and runtime gates for Phases 1-3 are incomplete until
repeatable workloads are recorded.
Phase 4 combined worker, movement, conversation, seat, and commit regressions
passed 47/47; independent review found and verified fixes for bounded seat
retries, public-zone restrictions, mounted-user eligibility, stale async
failures, and commit revalidation. The normal server `pnpm test` launcher could
not start because the sandbox denied the `tsx` IPC socket with `EPERM`; the
same registered suite was run through `node --import tsx --test`. The shared
suite was also run through Node directly. Live two-browser worker navigation
and controlled before/after workload measurements remain unverified. The
exploratory synthetic ramp below later confirmed loaded runtime metrics but
does not replace those gates. At the earlier inspection,
`https://localhost:5173` refused the connection, `docker` was unavailable, and
Podman access was denied; the later local ramp ran without restarting the stack.

Phase 5 initial idle-tick fast path was verified with the focused movement and
runtime-metrics suites (27/27) and `pnpm build`; `git diff --check` passed. The
test confirms stationary sessions bypass repeated movement work while a fresh
facing update is still applied. This is a code-level optimization only: no
before/after CPU comparison was captured at implementation time. The later
exploratory ramp below provides loaded-code measurements but is not a controlled
before/after comparison. Browser frame cost, two-browser behavior, and 200-user
support remain unverified; this change alone is not a capacity claim.

Phase 5 measurement hooks now report bounded patch-cycle timing and cumulative
application-frame, state-patch, and state-snapshot bytes on the server. The
client exposes bounded state-apply and render-callback percentiles through
`window.__gammyverseRuntimeMetrics()` in dev mode. These hooks are implemented
and covered by metrics tests. Server metrics were read during the exploratory
ramp below; client browser metrics were not collected.
