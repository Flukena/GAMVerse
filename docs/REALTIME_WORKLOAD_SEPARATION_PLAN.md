# Realtime workload separation plan

Date: 2026-10-20
Status: proposed; documentation only, not an implementation or capacity claim.

Related: [CPU and capacity plan](REALTIME_CAPACITY_PLAN.md) and
[runtime metrics](REALTIME_RUNTIME_METRICS.md).

## 1. Goal and decision rule

Keep the authoritative room loop responsive by removing redundant work first,
then isolating measured CPU-heavy or slow I/O work where justified.

Moving work to another pod does not reduce total CPU by itself. Worker threads
protect the main event loop but still consume CPU inside the same container.
Do not introduce a service merely to hide an unexplained idle CPU problem.

This plan does not authorize production deployment, production Compose changes,
new infrastructure dependencies, room-limit changes, or data deletion.

## 2. Latest observation and limits

Local Podman observation at approximately 17:23-17:24 ICT on 2026-10-20:

- Internal metrics confirmed one active room and one participant before and
  after measurement; zero recent server errors.
- Three consecutive 10-second process CPU-time samples showed realtime at
  1.3%, 1.3%, and 1.2% of one core.
- Vite used 10.4-11.0%; the route-worker esbuild watcher used 1.2-1.4%.
- Realtime runtime CPU counters independently increased by approximately
  0.39 CPU seconds over 30 seconds.
- Map-parse and vehicle-world-rebuild counters did not increase in that window.
- Tick start gaps were approximately 50 ms. The capacity plan documents that
  Colyseus interprets `setFixedTimestep(..., 20)` as 20 Hz, not a 20 ms interval.
  Instrumentation version 2 incorrectly labels the expected interval as 20 ms;
  do not use its estimated missed-interval count for acceptance.
- The screenshot's 289.7% reading was not reproduced concurrently. Its cause
  remains unconfirmed; this observation does not diagnose the production host.

This was not a controlled movement benchmark, empty-room test, or capacity
certification. Do not extrapolate the one-participant CPU result to 200 users.

## 3. Ownership and extraction candidates

| Work | Destination | Plan and constraints |
| --- | --- | --- |
| Movement intent validation, authoritative position, collision, facing, seating and vehicle occupancy | Keep in realtime | No network round trip in each simulation step; client coordinates are never authoritative |
| Zone membership, proximity groups, private access and media authorization | Keep authoritative state in realtime | Optimize lookup and cadence; preserve expiry and revocation while players are stationary |
| Pathfinding / auto travel | Existing worker threads first; optional navigation service later | A process-local route pool already exists in `packages/server/src/offices/routeSearchPool.ts`; verify runtime use before adding another mechanism |
| Static map, collision and seat-index preparation | Revision-scoped cache; worker preparation if profiling warrants it | Rebuild only when relevant geometry or props change; keep dynamic collision authoritative |
| Durable chat history, audit and analytics writes | Optional bounded persistence worker / queue | Preserve existing durability, ordering and acknowledgement semantics; no success response for lost durable work |
| LiveKit moderation and control-plane I/O | Optional media service | Service must obtain trusted current authorization; moving token signing alone is not an assumed CPU saving |
| Rendering, animation, interpolation and cosmetic effects | Client | Visual prediction is allowed; server reconciles outcomes and owns permissions |

Voice/video packet transport already belongs to LiveKit, not the realtime room
loop. Do not plan to extract that transport a second time.

## 4. Process and PR sequence

Each phase is a separate reviewable PR and must leave the game playable.
Optional phases proceed only after their measurement gate is met.

### Phase 0: Reproduce and attribute before changing architecture

1. Record deployed artifact/revision, process start time, environment, room cap,
   room/player/connection counts and actual simulation frequency.
2. Measure CPU deltas for API, realtime, workers and dev watchers separately.
   Compare simultaneous container/VM readings; do not equate a desktop gauge
   with realtime process CPU without attribution.
3. Capture matched windows for: no rooms, an empty retained room if supported,
   one connected stationary player, and one moving player.
4. If idle CPU remains high, profile the process/thread consuming it. Record
   reconnect retention, outstanding routes, timers and room disposal behavior.
5. Correct expected-tick instrumentation before using scheduling gates.

Exit: a reproducible baseline identifies the expensive work, or explicitly
records that the reported spike was not reproduced.

### Phase 1: Eliminate unnecessary work and verify room lifecycle

- Verify the current parsed-map cache, seat index, collision index and spatial
  cadence implementation instead of duplicating changes already in the worktree.
- Ensure empty rooms dispose or suspend unnecessary simulation according to
  the intended reconnect contract. Do not invent a new reconnect timeout.
- Keep time-driven private access expiry, moderation and cleanup functioning
  independently of movement.
- Prepare static geometry once per relevant revision, not on every tick.

Exit: idle profiles contain no repeated full-map parsing/rebuilding; empty-room
behavior and stationary deadlines have regression coverage.

### Phase 2: Isolate navigation only if route load warrants it

- Verify existing worker pool queue bounds, fairness, cancellation, timeouts,
  worker recovery and shutdown behavior.
- If an independent service is justified, preserve those contracts across the
  transport rather than adding an unbounded remote queue.
- Include room incarnation, request/session identity and geometry/access
  revision in jobs. Reject stale or cancelled results after map edits,
  disconnects, reconnects or permission changes.
- Realtime validates applicability and executes movement; a returned route
  cannot grant access or set trusted player coordinates.
- Surface overload and worker/service failure explicitly. Do not silently run
  an expensive synchronous fallback on the realtime event loop.

Exit: route bursts no longer block the room loop; service extraction proceeds
only if it provides measured isolation or scaling value beyond existing threads.

### Phase 3: Isolate persistence only if I/O is a measured bottleneck

- Inventory writes and classify which require a durable acknowledgement.
- Design bounded admission, retry limits, idempotency, per-stream ordering,
  failure reporting and shutdown/drain behavior before introducing a queue.
- Define recovery after a worker or realtime restart. In-memory enqueue alone
  must not acknowledge a durable write.
- Keep membership/role checks server-side and preserve private chat audience.

Exit: failures do not lose acknowledged durable writes, duplicate effects or
change chat ordering/visibility; room responsiveness improves under write load.

### Phase 4: Optional media control-plane service

- Profile token issuance and moderation before extraction.
- Keep authoritative room/audience decisions in realtime; define authenticated
  service-to-service requests and explicit behavior when authorization cannot
  be checked.
- Test expiry, stale membership, bans, role changes and revocation races.
- Do not cache authorization beyond its valid lifecycle or weaken media grants.

Exit: no unauthorized grants or moderation actions; measured benefit justifies
the extra service and its failure modes.

## 5. Test and verification matrix

| Scenario | Required checks |
| --- | --- |
| No rooms / last user leaves | CPU delta, active rooms, pending jobs/timers, disposal and memory stabilization |
| Reconnect retention | State remains available for the existing window; no duplicate session or premature disposal |
| Stationary users | No repeated full-map work; private access still expires and media is revoked |
| Movement, seating and vehicles | Server collision/facing/occupancy unchanged; two real browser sessions agree |
| Map or props edited during route search | Version paths stay separate; stale route/index results cannot overwrite newer state |
| Worker/service crash or queue saturation | Bounded work, explicit busy/failure response, recovery without blocking synchronous fallback |
| Durable-write retries and restart | No lost acknowledged writes, duplicate effects or ordering/visibility regression |
| Media permission changes | Current membership/role enforced; stale grants cannot gain broader access |
| Load ramp and soak | Separate same-room from multi-room results; record CPU, tick and event-loop p95/p99, queue wait, RSS, outbound bytes and disconnects |

For each implementation PR:

1. Add focused regression tests that fail when the behavior change is reverted;
   register new test files in the package's explicit test script.
2. Run targeted tests and `pnpm build` for TypeScript changes.
3. Verify multiplayer behavior with two browser sessions on Compose.
4. Repeat matched baseline workloads on the same map, hardware, tick rate and
   build mode. Separate load-generator CPU from realtime CPU.
5. Apply the quantitative acceptance gates and repeat/soak procedure in the
   capacity plan. Record pass/fail/skip and any pre-existing test failures.
6. Obtain independent review, document results and retain a rollback path.

Do not certify 200 users in one office from a test split across multiple rooms,
or certify voice/video from WebSocket-only mock clients.

## 6. Rollout and rollback

Keep existing worker execution as the baseline until an optional extraction
passes its tests. Compare one architectural change at a time.

Define rollback before rollout: stop admitting new remote jobs, invalidate
in-flight results and return to the known bounded execution path. Never replay
non-idempotent writes or fall back to blocking pathfinding.

Production rollout and production configuration changes require owner approval.
Update the current architecture documentation when an extraction is actually
implemented, not while it is only proposed.

## 7. Execution checklist

- [ ] Phase 0: capture matched runtime baseline and fix tick metric semantics.
- [ ] Phase 1: verify idle lifecycle and remove redundant work.
- [ ] Phase 2: validate existing route pool; decide whether a service is needed.
- [ ] Phase 3: measure persistence; extract only if justified.
- [ ] Phase 4: measure media control plane; extract only if justified.
- [ ] Run focused tests, build, two-browser checks and matched load/soak tests.
- [ ] Record results, independent review and rollback readiness.
- [ ] Obtain approval before any production rollout.
