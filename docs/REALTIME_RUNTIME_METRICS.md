# Realtime runtime metrics

Phase 0 instrumentation for `REALTIME_CAPACITY_PLAN.md` extends the existing
`GET /internal/operations/metrics` response with `runtime`. The existing internal
service token remains required before either database readiness or runtime metrics
are collected. Responses use `Cache-Control: no-store` and include aggregate
numbers only, with no office, room, account, session or map data.

## Units and interpretation

- Tick duration and per-room start-gap percentiles are in milliseconds. Each
  process retains at most 4,096 durations and 4,096 gaps across all rooms. Read
  sample counts with percentiles; they cover recent samples, not the process
  lifetime. Counts and missed-interval estimates are lifetime process totals.
- `estimatedMissedIntervals` sums `max(0, floor(startGapMs / 50) - 1)` per room.
  This is an observed start-gap estimate, not a count of Colyseus skipped ticks.
  Colyseus fixed-step catch-up may execute several callbacks back-to-back; these
  produce short gaps and cannot reconstruct all scheduler deadlines. Tick timing
  measures the entire room step, including its synchronous reconciliation, but
  excludes state serialization and transport work outside that callback.
- **Instrumentation version 3:** the room and metrics share a 20 Hz constant;
  `expectedIntervalMs` is derived as 50 ms. This preserves simulation frequency.
  Version 2 interval caveat: `OfficeRoom` calls
  `setFixedTimestep(callback, 20)`, and Colyseus interprets this argument as
  20 Hz (about 50 ms per step). Version 2 incorrectly treats it as 20 ms, so
  its `expectedIntervalMs` and `estimatedMissedIntervals` are invalid. During the exploratory load ramp, observed
  tick start-gap p50 was about 50.7 ms, consistent with 20 Hz.
- Event-loop p50/p95/p99/max are sampled from Node's histogram every 5 seconds
  at 10 ms resolution, reported as `resolutionMs`. The histogram measures observed
  timer intervals, so its idle floor includes this resolution; a 20 ms capacity
  gate must be interpreted with that floor. `sampleWindowMs` gives the actual elapsed sampling window;
  values remain `null` until the first window. The interval is unreferenced and
  histogram/interval are stopped on process exit. Lifecycle start/stop is
  idempotent.
- `rssBytes` is process RSS in bytes. `cpuUsageMicros.user/system` are cumulative
  process CPU microseconds. Subtract consecutive snapshots and divide by elapsed
  wall time for CPU utilization; do not mistake cumulative totals for percent.
- `mapParses` counts explicit room layout parsing and parsing inside each
  room-owned `campusWorldFromConfig` call. It does not count unrelated API/shared
  utility parses. `mapApplies` counts accepted map revision applications.
  `vehicleWorldRebuilds` counts each collision world constructed by the vehicle
  refresh path, including a separate world for each driver, not refresh calls.
- `seatCandidates` counts unique indexed seat candidates considered per nearest
  seat query, including occupied candidates that are subsequently discarded.
  `proximityPairChecks` counts pairs entering proximity distance comparison after
  online/meeting/private eligibility filtering.
- `replication.patchCycleDurationMs` measures synchronous `broadcastPatch()`
  duration, including schema encoding and transport enqueue work, but excludes
  later socket draining/network latency. State patch, initial snapshot, and total
  application-frame byte counts are measured at each joined client's raw
  transport boundary. They exclude WebSocket/TCP/TLS framing and are process
  lifetime totals; divide counter deltas by elapsed seconds to get rates. The
  patch cycle duration and byte counters include sessions after their `onJoin`
  hook, so the initial handshake can be omitted.
- Route queue depth and route search duration remain unavailable (`null`). The
  worker pool has no metrics hook yet; do not infer route backlog from tick time.
- `emptyRoomTickSkips` counts steps with no retained player state and no due
  private-access deadline. These steps skip movement and spatial projection,
  but remain included in tick counts and duration samples. Room timers and
  Colyseus auto-disposal/reconnect reservation semantics are unchanged.
- In a dev browser, `window.__gammyverseRuntimeMetrics()` returns bounded recent
  frame-callback and state-snapshot application percentiles, counts, and the
  latest snapshot player count. These metrics contain no player identifiers.

## Runtime verification boundary

`instrumentationVersion: 3` identifies corrected tick units and empty-room skipping;
`processStartedAtIso` identifies a process startup time. Neither proves the running
bundle matches the entire checkout. Record the built artifact hash, command and
startup timestamp during a deliberate local test-stack restart before baseline
collection. A mounted source change or a successful local build alone does not
verify the already running process. No stack has been restarted by this change.

Baseline runs must use production bundles, separate API/realtime processes and
repeat the documented workloads in the capacity plan. These metrics do not by
themselves establish a player-capacity result.
