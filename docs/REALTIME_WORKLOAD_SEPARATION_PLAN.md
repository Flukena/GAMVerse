# Realtime workload separation plan

Date: 2026-10-20
Status: Phase 0-1 implementation started locally; no production rollout or capacity certification.

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

### Remote-browser stutter investigation (approximately 17:55-17:58 ICT)

The owner shared an authenticated browser page connected to the remote server.
The page showed two participants during these checks. No deployment, server
restart, permission change or server CPU profile was performed.

| Observation | Result |
| --- | --- |
| Stationary, 6-second requestAnimationFrame sample | 181 gaps; p50 33.3 ms, p95 41 ms, max 50.4 ms |
| Holding forward, 6-second sample | 183 gaps; p50 33.3 ms, p95 34.2 ms, max 42.3 ms |
| Holding backward, 6-second WebSocket sample | Main observed socket received 88 frames; gap p50 52.3 ms, p95 69.0 ms, max 72.4 ms |
| State application during backward check | Count rose from 16 to 103; rolling p95 0.1 ms, max 0.2 ms |
| Browser CPU sampling profile, stationary, approximately 5.4 seconds | Largest self-sampled frames: Three.js `renderObject` 25.1%, `projectObject` 17.9%, `updateMatrixWorld` 16.9%, `multiplyMatrices` 8.7%; camera occlusion `apply` 7.4% |

These measurements demonstrate substantial client rendering work and roughly
30 FPS on the integrated test browser, independently of the reported remote
container CPU reading. They are not a measurement of the owner's original
browser/GPU, a server tick profile or proof that networking never stalls.
The WebSocket sample includes frames other than state patches. A collision
notice appeared during backward movement, so neither directional check proves
uninterrupted travel throughout the whole window.

The attached console output primarily contained OBJ `usemap` warnings and an
AudioContext gesture warning. No timing correlation establishes those warnings
as the cause of ongoing stutter. Remote resource URLs and stacks show Vite
development modules and React development runtime; verify which frontend build
is actually served rather than assuming it is the production bundle.

Follow-up before implementing a rendering change:

- Capture the same browser workload with render calls/triangles, scene/mesh
  counts, shadow passes, matrix updates and camera occlusion cost.
- Evaluate static-transform caching, scene visibility/spatial culling,
  instancing/batching and avoiding settled occlusion material writes. Profile
  each candidate; preserve movable props, vehicles, doors, shadows and fades.
- Compare identical routes and camera poses before/after, with cold loading
  separated from steady-state frames. Target a 16.7 ms frame budget for 60 FPS
  on the agreed reference device; report p95/p99 and visual regressions.
- Independently collect a fresh remote realtime CPU/tick profile and deployed
  artifact identity. Do not attribute the server's reported 100% CPU to client
  rendering, or declare the server problem fixed from browser measurements.

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

### Phase 0-1 implementation record

- Simulation and diagnostics now share a 20 Hz constant (50 ms derived interval).
  Instrumentation version 3 distinguishes corrected metrics from version 2.
- Empty player-state rooms skip movement/spatial tick work unless a private
  deadline is due. Retained reconnect players are not treated as empty solely
  because the connected client count is zero.
- Verified installed Colyseus source: auto-dispose defaults to true, waits for
  reserved seats and concurrent leave hooks, and clears simulation/patch timers
  during disposal. Existing room disposal already cancels room route jobs and
  disposes the shared route pool when the last room is gone. No new disposal
  timer or reconnect timeout was introduced.
- Existing parsed-zone, seat-index and collision-index paths remain unchanged.
  Focused regressions cover idle work, deadlines and metric wiring.
- Production CPU profiling, artifact verification, controlled production-bundle
  baselines, and two-browser multiplayer checks remain outstanding. Historical
  version 2 observations above are retained as historical evidence.

Verification for this change:

- Focused metrics, room-metrics, spatial cadence, reconnection logging,
  conversation timer and movement regression files: 42 passed, 0 failed.
  The first run exposed unset coordinates in the new test fixture; initializing
  the fixture fixed that test, with no production behavior workaround.
- `pnpm build` passed for all packages when run alone in the dev container.
  The first build, concurrent with tests, was SIGKILLed during client type-check;
  the container reported an OOM kill. Keep memory-heavy verification sequential
  on this 2 GiB VM. No dependency or machine configuration changes were made.
- `git diff --check` passed.
- Passive check of the existing local process still returned instrumentation
  version 2: no rooms/participants, no additional ticks over 10 seconds, about
  1.57% of one core. This verifies existing no-room inactivity only, NOT the
  newly built version 3 runtime. No deliberate restart was performed.
- Independent review was attempted but the configured reviewer model alias was
  unavailable. Review remains a prerequisite for merge/deployment.

### Follow-up verification and Phase 2 lifecycle work

- Found that `OfficeRoom.onDispose()` cancelled queued searches but left the
  disposed room's snapshot in the process-local pool while other rooms remained.
  It now calls `removeSnapshot()`, releasing the cached geometry and invalidating
  active callers as well as queued jobs. Already-running synchronous searches
  remain bounded by the existing worker timeout; no synchronous fallback was
  added. Worker-local caches retain their existing bounded eviction policy.
- Added a two-room disposal regression: closing the first room removes its
  snapshot without shutting down the other room's pool; closing the last room
  disposes the pool. Added a real-worker burst test: 12 accepted requests, two
  worker slots, correct destinations, zero pending/active jobs after completion,
  and rejected admission after shutdown.
- Focused metrics, room lifecycle, spatial cadence, pool, execution and worker
  path suites: 28 passed, 0 failed. Existing tests exercised caps, weighted
  scheduling, cancellation, stale revisions, worker crashes and timeout recovery.
  This small burst is functional verification, not an event-loop load benchmark.
- Full `pnpm build` passed again sequentially.
- Started the built realtime bundle on a temporary port with no database or
  media credentials and a fresh temporary working directory. Metrics reported
  version 3, 50 ms expected interval, zero rooms/participants, zero additional
  ticks over 10.03 seconds, zero recent errors and approximately 0.57% of one
  core. Bundle SHA-256:
  `40550dd783b27dbdbecd78f686566e29525104bc0494c56385512ebfe61e4333`.
  The process was stopped and its temporary directory cleaned.
- The first isolated probe used the existing package working directory and
  restored a saved dev room, so it failed the zero-room precondition. It was
  stopped; the successful repeat used a fresh working directory to prevent
  Colyseus dev-mode room restoration. Neither probe restarted the main service.
- This is a built-bundle smoke check under `NODE_ENV=test`, not a production-mode
  database-backed baseline. Real two-browser checks, controlled route-burst
  event-loop measurements, production profiling and independent review remain
  outstanding. There is not yet evidence justifying a navigation service.

### Phase 2: reproducible route-burst diagnostic

Added `packages/server/src/offices/routeSearchBenchmark.ts` as an explicit
diagnostic, not an automatically run unit test or production endpoint.
Run from the repository root:

```sh
podman exec -w /workspace/packages/server gamverse_office-dev_1 \
  pnpm exec tsx src/offices/routeSearchBenchmark.ts
```

It uses two real workers, a synthetic 100 x 100 m world with seven alternating
barriers, one warm-up route and three 40-request bursts. The default per-room
queue cap admits 34 (two active plus 32 waiting) and explicitly rejects six as
busy. Unique sessions avoid conflating session-cap rejection with room overload.
No database, account creation, existing-room changes or network service is used.
All workers are terminated on exit. Output is aggregate JSON without user data.

The diagnostic asserts successful admission accounting, route completion at the
requested destination and empty active/pending queues. It measures submit to
dispatch wait, dispatch to response (including messaging, not pure search time),
end-to-end completion and main event-loop delay at 10 ms histogram resolution.
The 20 ms p99 comparison is reported rather than asserted as a stable CI test.
CPU is whole-process CPU, including worker threads and runtime overhead.

Latest corrected active-window run on the shared local 2 GiB VM:

| Window | Accepted / busy | Queue wait p95 | Dispatch-to-result p95 | Completion p95 | Main loop p99 |
| --- | --- | --- | --- | --- | --- |
| Warmed idle pool, 2 seconds | n/a | n/a | n/a | n/a | 12.72 ms |
| Burst 1, 1.24 seconds | 34 / 6 | 1149.91 ms | 94.90 ms | 1215.09 ms | 12.76 ms |
| Burst 2, 1.11 seconds | 34 / 6 | 1034.18 ms | 80.31 ms | 1090.37 ms | 11.97 ms |
| Burst 3, 1.08 seconds | 34 / 6 | 996.16 ms | 71.36 ms | 1053.75 ms | 12.27 ms |

All 102 admitted routes completed with zero failed jobs. Aggregate process CPU
was approximately 236-252% of one core during these active windows, while the
idle warmed pool used approximately 0.45%. This demonstrates why worker
isolation can keep the event loop responsive without lowering container CPU.
No CPU reduction or main-thread headroom percentage is inferred from this.

An earlier exploratory padded-window run had event-loop p99 30.97 ms in one
repeat (above the proposed 20 ms gate), alongside slower route responses.
The final harness measures burst windows without padding them with idle time.
The shared VM and short samples remain noisy; the latest three passes do not
erase that earlier observation or certify the gate.

Decision: retain the existing bounded pool for now. Queueing latency is visible
under a simultaneous burst, but there is insufficient evidence to add a remote
navigation service. Next collect representative saved-map route workloads with
room ticks and multiplayer clients running, longer repeated windows and a soak;
include latency expectations for interactive/seat/follow requests before tuning
admission or worker count.

Validation: server and client type-checks and server bundles passed in the full
build command. Vite was SIGKILLed twice; the container OOM-kill counter increased.
The remaining Vite production build passed when invoked directly with a
512 MiB heap:

```sh
podman exec -w /workspace/packages/client gamverse_office-dev_1 \
  node --max-old-space-size=512 node_modules/vite/bin/vite.js build
```

No persistent heap, VM, dependency or production configuration was changed.
Independent review and two-browser checks with the new runtime are still open.

### Phase 2: saved-map room-tick diagnostic

The same diagnostic now accepts an optional local office UUID. Database sessions
must be read-only; the tool verifies the database setting and office existence
before loading the map. Run only against the local development database:

```sh
podman exec -e PGOPTIONS='-c default_transaction_read_only=on' \
  -w /workspace/packages/server gamverse_office-dev_1 \
  pnpm exec tsx src/offices/routeSearchBenchmark.ts LOCAL_OFFICE_UUID
```

The process creates an isolated `OfficeRoom` with real Colyseus 20 Hz ticks and
two simulated schema players with fresh alternating movement inputs at 10 Hz.
It loads the saved map through the existing room path: 5,330 props, 170 zones,
680 walls in this run. Metadata persistence and incoming-message registration
are stubbed; there are no authenticated clients or WebSocket state patches.
The test does not modify the main realtime process, database records or media
permissions.

Eight public walkable start/destination pairs are sampled deterministically
from the map and warmed up sequentially; all eight returned routes. Bursts then
use these pairs in a separate real worker pool while the room ticks in the same
process. Returned benchmark routes are NOT installed into room movement, and
this static-geometry workload does not certify route-handler authorization,
dynamic vehicle revalidation, networking or two-browser behavior.

Latest completed run, three 40-request bursts with 3-second gaps:

| Repeat | Accepted / busy | Routes / null-point results / worker failures | Queue p95 | Dispatch-to-result p95 | Completion p95 | Event-loop p99 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 34 / 6 | 33 / 1 / 0 | 7820 ms | 502 ms | 8322 ms | 12.62 ms |
| 2 | 34 / 6 | 32 / 2 / 0 | 7787 ms | 501 ms | 8287 ms | 12.64 ms |
| 3 | 34 / 6 | 32 / 2 / 0 | 7778 ms | 501 ms | 8279 ms | 12.62 ms |

- 97/102 admitted requests returned routes; five returned `{ points: null }`.
  The output calls these `noRouteResults`, not proof of unreachable geometry:
  the current worker result does not distinguish budget exhaustion from no path.
  The same pairs worked during warm-up. No worker-level null result occurred.
- Active bursts lasted approximately 8.3 seconds each with whole-process CPU
  around 212-215% of one core. The warmed baseline with two simulated moving
  players used about 3.12%.
- Room tick counts increased by 169/168/168 across the measured burst windows
  (including the histogram warm-up). Rolling tick duration p95 was 0.71-0.88 ms;
  these percentiles also include earlier ticks, not per-burst-only samples.
- Map-parse and collision-world-rebuild counters did not increase during bursts.
- The main event loop stayed responsive in this sample, but approximately
  eight-second tail response and variable route success are NOT acceptable
  evidence for declaring navigation ready. Do not increase queue size, worker
  count or route time budgets to conceal this.

The first saved-map attempt asserted that every admitted request must return a
route and stopped at a null-point result. The diagnostic now reports that
outcome explicitly with `allAcceptedRoutesCompleted: false`, while retaining
strict synthetic-workload assertions. An earlier completed measurement also
left the isolated room's framework simulation timer running after `onDispose`;
that exact benchmark process was terminated. Cleanup now cancels the simulation
interval through the framework API before disposing the room. The final repeat
exited normally with code zero and no retained benchmark process.

Follow-up:

1. Profile real worker searches on these map pairs; separate A* expansion,
   collision queries and optional path smoothing. Responses near the existing
   500 ms search budget are evidence to investigate, not proof of which stage
   exhausted it.
2. Establish representative short/long/seat/follow routes, access overlays and
   interactive latency expectations before changing algorithms or admission.
3. Verify actual route installation and reconciliation with two authenticated
   browser sessions on a confirmed version 3 local runtime. This remains open.
4. Keep service extraction deferred: moving the same queue/search workload to
   another pod does not itself fix its latency.

Validation: seven focused regression files passed 53/53 sequentially, including
updated route-pool test doubles for the new snapshot-removal disposal contract.
The complete `pnpm build` passed with a command-scoped 512 MiB Node heap:

```sh
podman exec -w /workspace gamverse_office-dev_1 \
  env NODE_OPTIONS=--max-old-space-size=512 pnpm build
```

### Phase 2: worker CPU profile and walkability-cache optimization

Added an optional `--profile` flag to the diagnostic. Each benchmark worker
starts an in-thread Node inspector CPU sampling session; a separate MessagePort
requests the summary after all bursts. It does not open an inspector network
port or change the production worker protocol. Only aggregate top self-sampled
function times are printed, not map coordinates, credentials or a raw profile.
Worker teardown closes the profile ports. Timings with profiling enabled must
not be compared directly with normal benchmark timings.

```sh
podman exec -e PGOPTIONS='-c default_transaction_read_only=on' \
  -w /workspace/packages/server gamverse_office-dev_1 \
  pnpm exec tsx src/offices/routeSearchBenchmark.ts LOCAL_OFFICE_UUID --profile
```

Before optimization, approximately 40-second profiles for the two workers
(including warm-up and idle gaps) showed:

| Function | Worker 1 self time | Worker 2 self time |
| --- | --- | --- |
| Route `isWalkable` cache wrapper | 9067 ms | 7878 ms |
| Shared `blockersNear` | 4733 ms | 4041 ms |
| A* `findAutoRoute` | 3948 ms | 3422 ms |
| Shared `isPositionWalkable` | 3639 ms | 3256 ms |
| Garbage collection | 1542 ms | 1329 ms |
| `smoothAutoRoute` | 291 ms | 233 ms |

These are exclusive sampled frame times, not inclusive stage costs. Collision
work called by smoothing appears under collision functions, so smoothing's small
self time alone does not establish its total cost. The cache wrapper was the
largest non-idle self frame, motivating a bounded change there first.

Changed the per-search walkability cache in `routeNavigation.ts` from formatted
string coordinate keys to nested numeric X/Z maps. It preserves the existing
millimetre rounding, caches both true and false, keeps the same 100,000-entry
total cap and remains local to one search. No persistent cross-user or
cross-revision geometry cache, queue-size change, extra workers or search-budget
increase was introduced.

Two unprofiled runs after rebuilding the worker (six bursts total) returned
204/204 admitted routes with zero null-point results and the same six busy
responses per burst. Latest matched run:

| Repeat | Dispatch-to-result p95 | Completion p95 | Main event-loop p99 |
| --- | --- | --- | --- |
| 1 | 381 ms | 5484 ms | 12.59 ms |
| 2 | 380 ms | 5474 ms | 12.59 ms |
| 3 | 370 ms | 5413 ms | 12.61 ms |

Compared with the earlier approximately 8.3-second completion p95, the latest
run is about 34% lower; the first post-change run ranged 5.5-6.1 seconds.
Aggregate active-window CPU remains about 212-215% of one core, but bursts finish
sooner. This is a local observational before/after result on a shared VM, not a
controlled alternating A/B experiment or proof that production stutter is fixed.
Tail latency is still several seconds and Phase 2 is not complete.

Validation:

- Five focused files passed 54/54, covering generated-campus routes, dense
  segment collision checks, locked-zone detours, opposite-sign coordinates,
  per-search access isolation, dynamic overlays, seat/follow behavior and worker
  pool failure handling. Correctness tests protect unchanged behavior; the
  measured benchmark comparison is the optimization evidence.
- The complete `pnpm build` passed with the command-scoped 512 MiB heap.
- Profiles, benchmark processes and workers terminated normally; no main
  service restart or production deployment occurred.
- Independent review and two-browser verification with version 3 remain open.

Next investigate collision-query allocation and repeated edge checks using the
same saved-map workload, without weakening collision sampling or permissions.
Do not declare the remaining latency fixed or extract another service based
solely on this improvement.

### Phase 2: reduced-allocation shared collision queries

The worker profile above identified candidate collection in `blockersNear` as
another hot frame. Shared walkability queries now test candidates directly and
return at the first collision, instead of building a deduplicating `Set` and a
candidate output array before testing every collected blocker. World bounds are
checked first. This reduces allocation; it does not make queries allocation-free.
Repeated references in neighboring buckets may be tested more than once.

The existing overlap predicate, tangency, per-blocker clearance, static fallback,
dynamic vehicle grid, excluded own vehicle and denied-access overlay are
preserved. This shared change also applies to authoritative movement; no collision
decision or access rule was moved to the browser. Grid size, route sampling,
worker count, queue limits and search budgets were not changed.

The same saved-map diagnostic returned 102/102 admitted routes across three
bursts, with six busy responses per burst and no null-point results or worker
failures:

| Measurement | Observed range |
| --- | --- |
| Dispatch-to-result p95 | 297-305 ms |
| Completion p95 | 4280-4350 ms |
| Main event-loop p99 | 12.6-12.8 ms |
| Rolling room-tick duration p95 | 1.15-1.28 ms |
| Map-parse / collision-world-rebuild deltas | 0 / 0 |

Completion p95 is approximately 20-22% lower than the numeric-cache run and
48% lower than the original 8.3-second run. These remain observational results
on the same shared development VM, not controlled A/B or production capacity
results. Several-second burst tails remain unresolved.

Validation:

- New shared collision tests passed 3/3 and are registered in the package test
  script. They compare indexed/unindexed static, dynamic and access layers
  across three cell sizes and signed coordinates, exercise excluded vehicles
  and movement, and protect boundary/tangency/clearance behavior. An explicit
  short-circuit test rejects inspecting later blockers or buckets; the previous
  collection-first implementation fails that regression.
- Seven server regression files passed 63/63, covering routing, route execution,
  worker lifecycle, private access, ghost collision and movement handlers.
- The earlier shared index run had 19 passes and one chair-footprint failure.
  The same named assertion also fails against an isolated `git archive HEAD`
  baseline, confirming it predates these changes. It was not changed here.
  The temporary baseline was removed.
- The first full build with a 512 MiB heap was SIGKILLed at Vite rendering;
  the container's `oom_kill` counter increased to 4. Retrying the complete build
  with the command-scoped limits below passed, including all package type checks
  and production bundles. The existing large-chunk warning remains.

```sh
podman exec -w /workspace gamverse_office-dev_1 \
  env NODE_OPTIONS='--max-old-space-size=384 --max-semi-space-size=8' pnpm build
```

No persistent heap or VM configuration was changed. Benchmark processes and
workers exited; no benchmark process remains. Independent review is still open
because the configured reviewer model was unavailable.

### Local real-browser verification after the collision change

The owner approved restarting local realtime. The service was restarted through
its existing watcher and instrumentation version 3 / 50 ms expected ticks were
verified. The owner authenticated the browser at the local saved office used
above. This was a real browser session, separate from the simulated benchmark.

Checks performed:

- Backward movement displayed the existing prop/car collision notice. Forward
  movement and key release continued receiving state updates.
- A ground click produced an incoming `auto-move-status` message with `arrived`.
  This verifies one normal click-to-travel completion, not all route types or
  cancellation/permission/reconnect cases.
- After the final build, a seven-second forward/backward/stop check received
  93 WebSocket frames and applied 88 state updates. There were no new browser
  console errors during this check. Incoming-frame gap p95 was 74 ms;
  this includes application frames and is not a dedicated state-patch cadence.
- Actual requestAnimationFrame gaps in that check had median 33.3 ms,
  p95 34.3 ms and maximum 49.7 ms. State-apply duration rolling p95 was 0.2 ms
  with one player in the latest snapshot. Rendering remains approximately
  30 FPS; this work does not establish that visible stutter is fixed.
- A separate concurrent 12.01-second sample containing browser movement measured
  realtime process CPU at 2.76% of one core, 241 ticks, zero additional estimated
  missed intervals, no map parses/rebuilds, rolling tick-duration p95 1.41 ms and
  event-loop p99 12.94 ms. Rolling percentiles include earlier ticks; this is
  neither an idle baseline nor a load-capacity measurement.

The browser also reported transient 502/reconnection and asset-load errors around
the resource-constrained build/restart period. The final movement check above
was run after the successful build, not during it. Do not use build-time
disruptions as evidence for or against steady-state production behavior.

Two-account verification is still blocked: the browser runtime rejected creating
a second isolated context with a storage-affinity restriction. That restriction
was not bypassed. Although the owner approved one additional local QA account,
no account or invite was created because the second context could not be opened.
Two-session movement/presence/voice, 200-user load, soak tests and independent
review remain unverified. Production was not deployed or restarted, and its
reported 100% CPU has not been remeasured.

### Client rendering: hit targets and static local transforms

Reprofiled the authenticated local browser before editing. A 5.36-second idle
sample had requestAnimationFrame gap median 33.3 ms / p95 34.3 ms. Largest
exclusive sampled frames were shadow-map `renderObject` (1571 ms),
`updateMatrixWorld` (1030 ms), scene `projectObject` (1018 ms),
`multiplyMatrices` (423 ms), and camera occlusion `apply` (241 ms).
The installed Three.js source confirms that this `renderObject` is recursive
shadow-map traversal, not a count or duration of main-pass draw calls.

Two bounded changes:

1. Prop drag hitboxes and tabletop support planes are now created in
   `mapPropHitTargets.ts` with `visible = false`, rather than relying only on
   zero opacity/color writes. Three.js raycasting still includes these meshes,
   but visible scene/shadow traversal skips them. Their existing material flags,
   user-data identifiers, transforms and support-plane double-sidedness remain.
2. Fitted, non-animated prop and wall-model contents cache local matrices through
   `staticModelTransforms.ts`. This avoids recomposing their local TRS every
   frame. Movable editor parent pivots, doors, vehicles, avatars and pets are
   not frozen; world-matrix updates remain enabled. Authored manual matrices
   are retained without recomposition. Callers must not use this helper on
   animated contents or change cached local TRS without updating its matrix.

The first live/HMR sample stayed at 33.3 ms median. A source fetch confirmed the
new factory was served, but an explicit reload was required for reliable
measurement of rebuilt scene contents. After reload and warm-up, a profiled
five-second idle sample had median 25 ms / p95 33 ms (206 frame gaps). Its
exclusive samples included `updateMatrixWorld` 1459 ms, shadow traversal
991 ms and scene projection 627 ms over a 5.58-second profile. More frames were
rendered in this sample; raw exclusive totals are not comparable per-frame costs.
These results do not isolate the two changes or establish a stable FPS gain.

After the final successful build, reloaded and warmed the browser again, then
ran three four-second checks without a build running:

| Browser action | RAF gap median | RAF gap p95 | Maximum |
| --- | --- | --- | --- |
| Idle | 26.5 ms | 34.4 ms | 40.3 ms |
| Walk forward | 32.3 ms | 34.3 ms | 41.9 ms |
| Turn character/camera | 32.2 ms | 34.6 ms | 42.3 ms |

There were zero new console errors during those checks, movement controls stayed
enabled, and the latest snapshot contained one player. Rolling state-apply p95
was 0.2 ms. Idle frame time improved in these samples, but walking/turning still
remain near 30 FPS: the stutter issue is NOT closed.

A concurrent, separately measured 14.02-second realtime sample used 2.81% of one
core, advanced 281 ticks with zero extra estimated missed intervals, performed
zero map parses/rebuilds and had event-loop p99 15.33 ms. Process start identity
was checked before comparing CPU counters. This confirms a low local server
load in this window, not a production fix or a 200-user capacity result.

Validation: four focused client files passed 14/14. New tests are registered in
the client test script and assert actual raycasts through hidden targets,
moving-parent transforms, double-sided support hits, visible-traversal exclusion,
matrix equivalence, preserved manual matrices and no repeated local composition.
The initial matrix assertion distinguished signed zero; it now uses Three.js
matrix equality, preserving numerical equivalence without weakening the
composition-count regression. Editor dragging/placement was not exercised through
the browser or persisted; those behaviors are covered at the Three.js helper
level only.

The first build was SIGKILLed and the OOM-kill counter increased from 4 to 5.
A 320 MiB heap retry failed explicitly in client TypeScript with a heap-limit
error. The complete build then passed with command-scoped
`NODE_OPTIONS='--max-old-space-size=384 --max-semi-space-size=4'`.
No VM/service configuration was changed. During the unsuccessful/resource-heavy
period the browser logged reconnect 502s and a React maximum-update-depth error;
these were not observed in the final isolated movement check. They remain
diagnostic observations, not a claimed fix or a proven cause.

Next rendering gate: measure per-frame traversal/draw counts and investigate
spatial scene hierarchy and shadow traversal before introducing broader culling,
batching or shadow caching. Preserve editor picking, doors, opacity fades and
off-screen shadow casters. Do not lower visual quality or claim 60 FPS based on
one favorable idle sample. Independent review, two-user verification, load/soak
and production measurement remain open.

### Client rendering: avoid redundant occlusion work

The next unchanged-browser profile lasted 5.23 seconds. Occlusion `apply` had
390 ms exclusive sampled time, alongside shadow traversal 1249 ms, world-matrix
updates 1269 ms and scene projection 706 ms. This motivated a small change in
the existing occlusion module before attempting a broader spatial hierarchy.

- Compute the exponential fade blend once per camera frame, not once per
  registered occluder. Inactive camera modes still restore immediately.
- Skip interpolation when a fade is already exactly at its target.
- Write opacity, transparency, depth-write and cast-shadow properties only when
  their values change. Still inspect the source materials each frame: settled
  fades must reflect source opacity/render-flag changes, not silently cache
  obsolete values. Shader invalidation remains tied to transparency transitions.
- Keep sightline intersection, moving-door bounds, fade duration, snap tolerance,
  opacity, shadows and all camera modes unchanged. No reduced-quality switch or
  frame-rate cap was introduced.

Four focused files passed 15/15, including two new regressions that fail on the
previous implementation: twelve occluders evaluate the exponential once per
active frame, and settled materials receive no redundant writes while subsequent
source changes still propagate. Existing tests cover doorway visibility,
frame-rate-independent fades, moving doors, restoration and shared materials.
The complete build passed with the previously documented command-scoped
384 MiB old-space / 4 MiB semi-space limits.

Reloaded the real browser, warmed the saved office, then measured without builds
running. A 12.58-second profile containing idle, forward movement and turning
reported these four-second phase results:

| Action | RAF gap median | RAF gap p95 | Maximum |
| --- | --- | --- | --- |
| Idle | 25.1 ms | 33.8 ms | 34.4 ms |
| Forward | 25.1 ms | 33.6 ms | 34.1 ms |
| Turn | 25.7 ms | 33.9 ms | 41.0 ms |

Occlusion `apply` self samples were 446 ms (3.5% of the profile), compared with
7.5% in the preceding idle-only profile. These are different action windows,
not a controlled A/B cost reduction. Shadow traversal (3559 ms), world-matrix
updates (3272 ms) and scene projection (1727 ms) still dominated.

A second unprofiled check used three-second idle/backward/turn phases:
median 25.9/25.1/25.1 ms, p95 33.6 ms in all phases, maxima 50.2/41.1/34.1 ms.
It applied 75 state updates, retained enabled movement controls and logged zero
new console errors. Frame count corresponds to roughly 35 frames/second across
the windows; the inverse median near 40 FPS must not be reported as average FPS.
Median improvement is encouraging, but tail frames still miss 60 FPS and no
causal FPS claim can be isolated from these sequential shared-machine samples.

Concurrent realtime measurement over 12.04 seconds used 2.46% of one core,
advanced 241 ticks, added zero estimated missed intervals and performed zero
map parses/rebuilds. Event-loop p99 was 12.96 ms; process-start identity was
unchanged. This is one local player, not a load or production measurement.

Next substantial target remains scene/shadow traversal. Any spatial batching or
static-shadow caching needs explicit invalidation for asset loads, moving props,
doors, avatars, fades and editor previews before it can replace the current
per-frame work. Browser checks in this round do not certify editor operations,
two-user presence/voice or production CPU. Independent review remains open.

### Client rendering: skip unchanged static model matrix subtrees

Resumed rendering work after diagnostics. The shared page was initially on
`/maintainer`, where a first probe measured mostly idle browser work; it is NOT
an office rendering baseline. Navigated to the saved local office, waited for
models to warm up, and captured a new five-second profile before editing.
Importantly, this fresh baseline was already near 60 FPS: 300 frame gaps,
median 16.7 ms / p95 17.6 ms, over a 5.29-second CPU profile. It must not be
compared as a controlled before/after against earlier 30-35 FPS runs.
Largest exclusive samples were world-matrix traversal 1766 ms, shadow traversal
828 ms and scene projection 795 ms.

An initial extension cached the identity scene/campus ancestor matrices and
static prop/wall pivots, with explicit editor translation invalidation.
It passed tests but did not improve the first browser sample (287 gaps,
median 16.7 ms / p95 25 ms); merely avoiding multiplication still visits every
descendant. The final change adds `StaticModelRoot`, a focused Three.js group
for fully loaded, non-animated model contents. When neither inherited force,
local dirtiness nor the last propagated world matrix changes, it skips descendant
world-matrix traversal entirely. Otherwise it propagates a full update. Comparing
the propagated matrix also handles an external `getWorldPosition`/occlusion
query that updates the root before the render pass.

Rebase integration (2026-10-20): PR #21 subsequently added the overlapping
`StaticSceneGroup` and `OfficeMapSceneLayers` implementation on `origin/main`.
The integrated branch uses those upstream modules instead of retaining a second
`StaticModelRoot` or `translateMapPropRoots` implementation. The historical
measurements below describe the pre-rebase implementation. Current nested edits
require `StaticSceneGroup.invalidate()`; forced scene traversal alone does not
invalidate a static subtree. The local-matrix helpers remain complementary.
`OfficeMapSceneLayers.moveProp` also refreshes manually cached local matrices,
preserving model, picking and overlay alignment. The combined focused suites
passed 28/28 before completing the rebase.

Scope/invalidation contract:

- Only loaded static prop and wall-model roots use this group. Scene/campus
  identity ancestors cache their local matrices without freezing descendants.
  World auto-update remains enabled.
- Avatars, pets, vehicles, door hinges, camera and previews remain dynamic.
  Frustum/shadow passes, visibility, draw quality, collision and server rules are
  unchanged. This does not skip scene projection or shadow traversal.
- Editor horizontal/elevation translations use `translateMapPropRoots`, updating
  cached local matrices when necessary and preserving the existing prop-ID
  targeting. Parent changes and forced world updates still propagate.
- The group is not appropriate for animated descendants or later child insertion
  without explicit invalidation. Current callers attach complete models before
  registration. Preview clones start with an unpropagated transform state.

Four focused files passed **19/19**, no skips. Regressions count descendant visits
and multiplications (one initial visit, no extra visits over ten static frames),
exercise unrelated dynamic siblings, explicit parent moves, horizontal/elevation
editor translations, forced passes, preview cloning, raycasting, authored manual
matrices and late model insertion under clean scene ancestors. An integrated
occlusion test moves a static prop pivot out of and back into the sightline,
checking both opacity and the actual child world matrix before any child getter
can refresh it. The complete build passed with the existing command-scoped
384 MiB / 4 MiB memory settings.

The final static-root idle profile had 304 frame gaps, median 16.7 ms / p95
17.3 ms over a 5.27-second profile. World-matrix self samples were 1399 ms,
shadow traversal 986 ms and scene projection 691 ms. This is observational
sample variance, not isolated per-stage speedup or a frame-rate guarantee.
After the final build, an unprofiled three-phase real-browser check reported:

| Action (four-second windows) | Average FPS from frame count/time | RAF median | RAF p95 | Max |
| --- | --- | --- | --- | --- |
| Idle | 60.0 | 16.7 ms | 24.8 ms | 25.7 ms |
| Walk forward | 58.0 | 16.7 ms | 25.0 ms | 26.1 ms |
| Turn | 56.6 | 16.7 ms | 25.1 ms | 33.6 ms |

It applied 97 state updates, kept movement enabled and logged zero new console
errors during the window. Opened Modify props and cancelled without saving.
Actual pointer-drag/elevation persistence was not browser-tested; transform and
occlusion correctness there are covered by the helper/integration tests above.
Concurrent realtime CPU was **3.02% of one core** over 14.01 seconds, 280 ticks,
zero extra estimated missed intervals and zero map parses/rebuilds; event-loop
p99 was 15.23 ms with unchanged process identity.

The configured independent reviewer was attempted for this narrow transform
change but could not start because its `opus` model alias is unavailable.
No independent review is claimed. Two-player checks, controlled alternating
before/after measurements, sustained load/soak and production profiling remain
open. No production configuration/deploy, stored office map or props were changed.
Next performance gate remains scene/shadow traversal counts and spatial batching
with correct picking/visibility/shadow semantics, not speculative visual downgrade.

### Maintainer runtime diagnostics

Owner-selected scope: all-office visibility for **platform maintainers only**,
seven-day PostgreSQL persistence, and automatic bounded technical collection.
Office owners/admins do not inherit the read permission.

Implementation/workflow:

1. Shared `diagnostics.ts` defines a finite client event-code list and permits
   only a nullable office UUID plus bounded finite numeric measurements.
   Arbitrary messages, stack traces, URLs, roles, timestamps and metadata are
   rejected, rather than attempting unreliable text redaction.
2. Authenticated `POST /auth/diagnostics` validates before insertion and checks
   current office access for attributed reports. Limits are six events/account
   and 120 events total per API process per minute, with a bounded 5,000-key
   admission map. These limits are process-local, not distributed quotas.
3. The client reports visible RAF gaps >=250 ms, average frame gaps >=50 ms over
   five seconds, supported long tasks >=250 ms, uncaught/resource/console errors,
   unhandled rejections, unexpected realtime drops/errors, failed joins and
   exhausted voice retries. It copies no error/console arguments or resource URL.
   Expected leave/replacement/removal does not generate an unexpected-drop event.
   Hidden/resumed pages reset frame sampling. Browser CPU is not inferred.
4. Each client code has a one-minute cooldown. Uploads run every five seconds
   through a maximum 20-event queue, with an eight-second upload timeout,
   two-minute event expiry, at most three attempts and one-minute backoff after
   failure. Cleanup aborts uploads and releases RAF, timers, observers/listeners
   and the console wrapper. Failed uploads warn without generating recursive
   error telemetry. Browser closure can lose queued events.
5. API/realtime sample process CPU (including worker threads) every five seconds.
   >=80% of one core generates `cpu_peak`; maximum event-loop delay or sampling
   lateness >=250 ms generates `event_loop_stall`. Structured logger errors
   produce content-free `server_error` events. `uncaughtExceptionMonitor`
   attempts a content-free final flush without swallowing fatal exceptions or
   changing Node's crash behavior. Fatal/OOM/SIGKILL persistence is not guaranteed.
   Each server event kind has a one-minute cooldown and a bounded 200-event queue;
   batches contain at most 40 events. Persistence failures explicitly warn and
   dropped events are not represented as successful writes.
6. New migration `030_runtime_diagnostics.sql`, registered in `initializeDatabase`,
   stores receive/sample timestamps, source, code, optional office UUID and numeric
   metrics. No actor username/session is retained. It was applied locally using
   the normal initializer; no existing migration was edited.
7. `GET /maintainer/diagnostics` checks the current platform role on every request,
   filters expired records, returns at most 50 events plus a numeric-ID cursor
   and disables HTTP caching. Numeric ordering is explicitly qualified because
   the selected `id::text` alias otherwise sorts lexicographically. The new
   diagnostics page is linked from the lobby, refreshes on demand, holds up
   to 50 entries per page with older-event pagination and exposes load failures. Client observations
   are labelled unverified; an empty history does not imply no incidents.
8. API startup begins hourly indexed cleanup of records older than seven days.
   Reads exclude expired rows even if cleanup is temporarily unavailable.

Verification:

- Shared/client focused tests passed **4/4**: strict technical contract and
  private-field rejection, code cooldown, captured office context, bounded queue,
  bounded retries and expiration.
- Server focused tests passed **8/8**: unauthenticated/ordinary read rejection,
  cursor validation, current office authorization, account/global rate caps,
  persistence failures, bounded limiter keys, exact CPU/loop thresholds and
  content-free logger observation. A real PostgreSQL transaction inserted 52
  recent events plus an expired event, checked numeric pagination and retention,
  then rolled back; no test event from that transaction remains. All new test
  files are registered in their package scripts.
- Final verification also included the existing account-role and suspension
  endpoint regressions: **21/21** total across the shared/client/server selections,
  no skips, followed by another successful complete build.
- The first database test correctly exposed the unapplied local migration.
  After applying it, the pagination test exposed text-alias sorting; qualified
  numeric ordering fixed it. Final tests passed with no skips.
- Complete package type checks and production bundles passed using command-scoped
  `NODE_OPTIONS='--max-old-space-size=384 --max-semi-space-size=4'`. Existing large
  Vite chunk warnings remain.
- Before the owner's separately approved local maintainer grant, the shared
  browser's office-owner account received **403** for the global history endpoint.
  No unauthorized elevation was used for testing; the owner subsequently asked
  explicitly to grant the existing local account platform maintainer access.
- Real-browser synthetic error/350 ms busy-task checks produced persisted
  `browser_error`, `frame_stall` and supported `long_task` reports. Requests
  contained only `code`, `metrics`, `officeId`; deliberately supplied private test
  message/URL text was not uploaded. A later console-error/stall check returned
  **201** for two uploads. The maintainer API returned no extra identity/text
  fields and no private test string.
- `/maintainer` rendered the real table, Refresh displayed the new events, and
  reloading the page retained history without an alert. Synthetic test incidents
  remain in the local seven-day history; they are not evidence of a real outage.
- A separate short-lived server collector process exercised the actual logger,
  five-second batch flush and PostgreSQL path. `server_error` persisted and its
  raw synthetic error text did not. The process closed its timer and database.

Limits/open work: this is sampled lightweight diagnostics, not external crash
monitoring, complete error counts, full stack-trace debugging or controlled
performance overhead certification. Real network-outage/voice-failure, fatal
process loss, retention under production volume, multi-replica quotas,
independent review and 200-user overhead/load checks remain open. Production
configuration/data/services were not changed or deployed. Existing multiplayer
and rendering work remains open; collecting events does not fix those issues.

#### Dedicated diagnostics page follow-up

Moved incident history out of the lobby overview into `/maintainer/diagnostics`.
Maintainers see an Open runtime diagnostics link on the lobby; the page provides
Back to lobby, current-page source/event/office filters, expandable full technical
records, UTC timestamps and older/newer cursor navigation. Each page replaces the
previous 50 records instead of accumulating records indefinitely. Navigation
history updates only after successful requests. Filters explicitly label their
current-page scope, including a no-matches state.

The route retains maintainer-only login, explicitly denies ordinary authenticated
accounts without logging them out, and does not restore remembered office state.
Its independent scroll container avoids the lobby shell's fixed overflow clipping.
No API grants, stored payloads or collection rules changed.

Real browser checks verified lobby link navigation, no inline history on the lobby,
direct reload, Back to lobby, source/event filters, office no-match state,
expandable event ID/UTC/evidence detail and scrolling on a 606 px viewport.
The page loaded 26 actual local events. A mocked multi-page browser attempt timed
out and does not certify the new older/newer UI; existing database cursor tests
cover numeric ordering, but multi-page UI verification remains open.
The first full build was SIGKILLed during Vite output; a second complete build
passed with the existing command-scoped memory limits. Existing chunk warnings
remain. No production changes or new persisted test records were made.

- [ ] Phase 0: capture matched runtime baseline and fix tick metric semantics.
- [ ] Phase 1: verify idle lifecycle and remove redundant work.
- [ ] Phase 2: validate existing route pool; decide whether a service is needed.
- [ ] Phase 3: measure persistence; extract only if justified.
- [ ] Phase 4: measure media control plane; extract only if justified.
- [ ] Profile and optimize the independently observed client rendering bottleneck.
- [ ] Run focused tests, build, two-browser checks and matched load/soak tests.
- [ ] Record results, independent review and rollback readiness.
- [ ] Obtain approval before any production rollout.
