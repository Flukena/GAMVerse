import assert from "node:assert/strict";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { MessageChannel, Worker, type MessagePort } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import { mock } from "node:test";
import { WORLD, PlayerState, isPositionWalkable, makeBlockerGrid, type RoomLayout, type WorldConfig } from "@gammyverse/shared";
import { RouteSearchPool } from "./routeSearchPool.js";
import type { RouteSearchRequest, RouteSearchSnapshot, RouteWorkerMessage } from "./routeSearchProtocol.js";
import { resolveRouteSearchWorkerPath } from "./routeSearchWorkerPath.js";

const BURST_REQUEST_COUNT = 40;
const REPEAT_COUNT = 3;
const SAMPLE_WINDOW_MIN_MS = 2000;
const EVENT_LOOP_RESOLUTION_MS = 10;
const MAIN_LOOP_P99_GATE_MS = 20;
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number) => sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1]! : null;
  return { count: sorted.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: sorted.at(-1) ?? null };
}

const obstacles = Array.from({ length: 7 }, (_, index) => ({
  x: -24 + index * 8, z: index % 2 ? 12 : -12, width: 2, depth: 60,
}));
const snapshot: RouteSearchSnapshot = {
  roomId: "synthetic-benchmark", revision: 1,
  world: {
    ...WORLD, width: 100, depth: 100, walls: [], obstacles,
    collisionGrid: makeBlockerGrid(obstacles),
  },
};
function request(id: string, geometry = snapshot, start = { x: -40, z: 0 }, destination = { x: 40, z: 0 }): RouteSearchRequest {
  return {
    roomId: geometry.roomId, revision: geometry.revision,
    sessionId: id, requestId: id, priority: "interactive",
    start, destination,
  };
}

async function measure(run: () => Promise<Record<string, unknown>>, minimumWindowMs = SAMPLE_WINDOW_MIN_MS) {
  const histogram = monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS });
  histogram.enable();
  await pause(100);
  histogram.reset();
  const startedAtMs = performance.now();
  const cpu = process.cpuUsage();
  try {
    const result = await run();
    const workElapsedMs = performance.now() - startedAtMs;
    await pause(Math.max(0, minimumWindowMs - (performance.now() - startedAtMs)));
    const elapsedMs = performance.now() - startedAtMs;
    const usage = process.cpuUsage(cpu);
    const p99Ms = histogram.percentile(99) / 1_000_000;
    return {
      ...result, workElapsedMs, elapsedMs,
      processCpuPercentOneCore: (usage.user + usage.system) / (elapsedMs * 10),
      eventLoop: {
        resolutionMs: EVENT_LOOP_RESOLUTION_MS,
        p95Ms: histogram.percentile(95) / 1_000_000, p99Ms,
        maxMs: histogram.max / 1_000_000,
        p99GateMs: MAIN_LOOP_P99_GATE_MS, p99GatePassed: p99Ms <= MAIN_LOOP_P99_GATE_MS,
      },
    };
  } finally {
    histogram.disable();
  }
}

async function main() {
  const savedOfficeId = process.argv.slice(2).find(argument => argument !== "--profile");
  if (savedOfficeId !== undefined) assert.match(savedOfficeId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "pass one local office UUID or omit it for synthetic mode");
  const { closeDatabase, database } = await import("../infra/db.js");
  let room: import("./OfficeRoom.js").OfficeRoom | undefined;
  let geometry = snapshot;
  let endpoints = [{ start: { x: -40, z: 0 }, destination: { x: 40, z: 0 } }];
  let stopInputs: ReturnType<typeof setInterval> | undefined;
  let metrics: typeof import("../infra/realtimeRuntimeMetrics.js").realtimeRuntimeMetrics | undefined;
  try {
    if (savedOfficeId) {
      assert.ok(database, "saved-map mode requires local database configuration");
      assert.equal(process.env.PGOPTIONS, "-c default_transaction_read_only=on", "saved-map mode requires read-only database sessions");
      assert.equal((await database.query<{ default_transaction_read_only: string }>("SHOW default_transaction_read_only")).rows[0]?.default_transaction_read_only, "on");
      assert.equal((await database.query("SELECT 1 FROM app_offices WHERE id = $1", [savedOfficeId])).rowCount, 1, "office must exist");
      const { OfficeRoom } = await import("./OfficeRoom.js");
      metrics = (await import("../infra/realtimeRuntimeMetrics.js")).realtimeRuntimeMetrics;
      room = new OfficeRoom();
      room.roomId = "isolated-saved-map-benchmark";
      mock.method(room, "setMetadata", async () => {});
      mock.method(room, "onMessage", () => () => {});
      await room.onCreate({ officeId: savedOfficeId });
      const internal = room as unknown as {
        world: WorldConfig; mapLayout: RoomLayout;
        movementInputs: Map<string, { x: number; z: number; sprint: boolean; receivedAt: number }>;
      };
      geometry = { roomId: room.roomId, revision: 1, world: internal.world };
      const points: Array<{ x: number; z: number }> = [];
      for (let x = -internal.world.width / 2 + 4; x < internal.world.width / 2 - 4; x += 8) {
        for (let z = -internal.world.depth / 2 + 4; z < internal.world.depth / 2 - 4; z += 8) {
          const point = { x, z };
          if (isPositionWalkable(point, internal.world) && !internal.mapLayout.zones.some(zone => Math.abs(x - zone.x) <= zone.width / 2 + 1 && Math.abs(z - zone.z) <= zone.depth / 2 + 1)) points.push(point);
        }
      }
      assert.ok(points.length >= 2, "saved map must have public walkable sample points");
      endpoints = points.slice(0, 8).map((start, index) => ({
        start, destination: points[points.length - 1 - index]!,
      }));
      for (let index = 0; index < 2; index++) {
        const player = new PlayerState();
        player.x = points[index]!.x; player.z = points[index]!.z;
        player.rotation = 0; player.presence = "online";
        room.state.players.set(`benchmark-${index}`, player);
      }
      const refreshInputs = () => {
        for (let index = 0; index < 2; index++) internal.movementInputs.set(`benchmark-${index}`, {
          x: Math.floor(performance.now() / 1000) % 2 ? 1 : -1, z: 0, sprint: false, receivedAt: performance.now(),
        });
      };
      refreshInputs();
      stopInputs = setInterval(refreshInputs, 100);
      console.log(JSON.stringify({ map: { props: internal.mapLayout.props.length, zones: internal.mapLayout.zones.length, walls: internal.mapLayout.walls.length }, simulatedPlayers: 2, browserClients: 0, roomTickHz: 20, readOnlyDatabase: true }));
    }
    await runBursts(geometry, endpoints, Boolean(savedOfficeId), metrics);
  } finally {
    if (stopInputs) clearInterval(stopInputs);
    room?.setSimulationInterval();
    room?.onDispose();
    room?.clock.clear();
    room?.clock.stop();
    mock.restoreAll();
    await closeDatabase();
  }
}

async function runBursts(
  geometry: RouteSearchSnapshot,
  endpoints: Array<{ start: { x: number; z: number }; destination: { x: number; z: number } }>,
  savedMap: boolean,
  metrics?: typeof import("../infra/realtimeRuntimeMetrics.js").realtimeRuntimeMetrics,
) {
  const dispatchTimes = new Map<string, number>();
  const workerPath = resolveRouteSearchWorkerPath(import.meta.url);
  const profile = process.argv.includes("--profile");
  const profilePorts: MessagePort[] = [];
  const pool = new RouteSearchPool({
    workerFactory: () => {
      const options = workerPath.endsWith(".ts") ? { execArgv: ["--import", "tsx"] } : {};
      const channel = profile ? new MessageChannel() : undefined;
      if (channel) profilePorts.push(channel.port1);
      const worker = profile ? new Worker(`
        const { workerData } = require("node:worker_threads");
        const { Session } = require("node:inspector/promises");
        (async () => {
          const session = new Session();
          session.connect();
          await session.post("Profiler.enable");
          await session.post("Profiler.start");
          await import(${JSON.stringify(pathToFileURL(workerPath).href)});
          workerData.profilePort.on("message", async message => {
            if (message.type !== "benchmark-profile-stop") return;
            const { profile } = await session.post("Profiler.stop");
            session.disconnect();
            const nodes = new Map(profile.nodes.map(node => [node.id, node]));
            const totals = new Map();
            for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
              const frame = nodes.get(profile.samples[index]).callFrame;
              const key = JSON.stringify({ function: frame.functionName, url: frame.url, line: frame.lineNumber + 1 });
              totals.set(key, (totals.get(key) ?? 0) + (profile.timeDeltas?.[index] ?? 0));
            }
            workerData.profilePort.postMessage({
              type: "benchmark-profile",
              durationMs: (profile.endTime - profile.startTime) / 1000,
              topSelf: [...totals].sort((a, b) => b[1] - a[1]).slice(0, 20)
                .map(([key, micros]) => ({ ...JSON.parse(key), selfMs: micros / 1000 })),
            });
          });
        })().catch(error => { throw error; });
      `, { ...options, eval: true, workerData: { profilePort: channel!.port2 }, transferList: [channel!.port2] }) : new Worker(workerPath, options);
      const postMessage = worker.postMessage.bind(worker);
      worker.postMessage = (message: RouteWorkerMessage) => {
        if (message.type === "search") dispatchTimes.set(message.request.requestId, performance.now());
        postMessage(message);
      };
      return worker;
    },
  });
  try {
    assert.equal(pool.setSnapshot(geometry), true);
    const reachable: typeof endpoints = [];
    for (const [index, pair] of endpoints.entries()) {
      const warmup = pool.submit(request(`warmup-${index}`, geometry, pair.start, pair.destination));
      assert.equal(warmup.admission.status, "queued");
      if ((await warmup.result)?.points) reachable.push(pair);
    }
    assert.ok(reachable.length > 0, "at least one sampled pair must produce a route");
    console.log(JSON.stringify({
      workload: savedMap ? "saved local map with real room ticks and two simulated players; no browsers or network patches" : "synthetic seven-barrier detour; not the saved office map",
      reachablePairs: reachable.length, sampledPairs: endpoints.length,
      workers: 2, burstRequests: BURST_REQUEST_COUNT, repeats: REPEAT_COUNT,
      cpuProfilingEnabled: profile,
      timing: "dispatch wait excludes search; dispatch-to-result includes messaging and search",
      cpu: "process CPU includes worker threads; not main-thread CPU",
      baseline: await measure(async () => ({ phase: "idle warmed pool" })),
    }));
    for (let repeat = 1; repeat <= REPEAT_COUNT; repeat++) {
      dispatchTimes.clear();
      const before = metrics?.snapshot();
      const result = await measure(async () => {
        const queueWait: number[] = [], dispatchToResult: number[] = [], completion: number[] = [];
        let admitted = 0, busy = 0, completedRoutes = 0, failed = 0, noRouteResults = 0;
        const pending: Promise<void>[] = [];
        for (let index = 0; index < BURST_REQUEST_COUNT; index++) {
          const id = `${repeat}-${index}`;
          const submittedAtMs = performance.now();
          const pair = reachable[index % reachable.length]!;
          const job = pool.submit(request(id, geometry, pair.start, pair.destination));
          if (job.admission.status !== "queued") { busy++; continue; }
          admitted++;
          pending.push(job.result.then(route => {
            const finishedAtMs = performance.now();
            const dispatchedAtMs = dispatchTimes.get(id);
            assert.notEqual(dispatchedAtMs, undefined);
            queueWait.push(dispatchedAtMs! - submittedAtMs);
            dispatchToResult.push(finishedAtMs - dispatchedAtMs!);
            completion.push(finishedAtMs - submittedAtMs);
            if (route?.points) {
              assert.deepEqual(route.points.at(-1), pair.destination);
              completedRoutes++;
            } else if (route) noRouteResults++;
            else failed++;
          }));
        }
        await Promise.all(pending);
        assert.equal(admitted + busy, BURST_REQUEST_COUNT);
        assert.ok(busy > 0, "burst must exercise backpressure");
        assert.equal(completedRoutes + noRouteResults + failed, admitted);
        if (!savedMap) assert.equal(completedRoutes, admitted, "synthetic accepted detours must complete");
        assert.equal(pool.pendingCount, 0);
        assert.equal(pool.activeCount, 0);
        return { repeat, admitted, busy, completedRoutes, noRouteResults, failed, allAcceptedRoutesCompleted: completedRoutes === admitted, queueWait: distribution(queueWait), dispatchToResult: distribution(dispatchToResult), completion: distribution(completion) };
      }, 0);
      const after = metrics?.snapshot();
      console.log(JSON.stringify({
        ...result,
        room: before && after ? {
          tickCountDelta: after.tick.count - before.tick.count,
          rollingTickDuration: after.tick.duration,
          mapParsesDelta: after.counters.mapParses - before.counters.mapParses,
          vehicleWorldRebuildsDelta: after.counters.vehicleWorldRebuilds - before.counters.vehicleWorldRebuilds,
        } : null,
      }));
      if (savedMap) await pause(3000);
    }
    if (profile) {
      for (const port of profilePorts) {
        const summary = await new Promise<unknown>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Worker profile response timed out")), 5000);
          const receive = (message: { type: string }) => {
            if (message.type !== "benchmark-profile") return;
            clearTimeout(timeout);
            port.off("message", receive);
            resolve(message);
          };
          port.on("message", receive);
          port.postMessage({ type: "benchmark-profile-stop" });
        });
        console.log(JSON.stringify(summary));
      }
    }
  } finally {
    await pool.dispose();
    for (const port of profilePorts) port.close();
  }
}

await main();
