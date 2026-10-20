import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { findAutoRoute } from "./routeNavigation.js";
import { makeBlockerGrid } from "@gammyverse/shared";
import { RouteSearchPool } from "./routeSearchPool.js";
import { routeSearchWorld, type RouteSearchRequest, type RouteSearchSnapshot, type RouteWorkerResponse } from "./routeSearchProtocol.js";

class FakeWorker extends EventEmitter {
  messages: any[] = [];
  terminated = false;
  postMessage(message: any) { this.messages.push(message); }
  terminate() { this.terminated = true; return Promise.resolve(0); }
  respond(requestId?: string) {
    const request = [...this.messages].reverse().find((message) => message.type === "search")?.request;
    const id = requestId ?? request?.requestId;
    assert.ok(id, "expected a dispatched request");
    this.emit("message", { type: "result", requestId: id, result: { points: [{ x: 1, z: 2 }] } } satisfies RouteWorkerResponse);
  }
  fail() { this.emit("error", new Error("worker crashed")); }
}

const snapshot: RouteSearchSnapshot = { roomId: "room-a", revision: 1, world: { width: 20, depth: 20, playerRadius: 0.3, movementSpeed: 2, proximityRadius: 5, voiceFullVolumeRadius: 2, meetingZone: { id: "meeting", x: 0, z: 0, radius: 1, exitRadius: 2 }, spawnPoints: [], walls: [], obstacles: [] }, seatLayout: { props: [{ id: "chair", asset: "chair", x: 1, z: 2, width: 1, depth: 1, rotation: 0, collision: false }], zones: [] } };
function request(id: string, sessionId: string, priority: RouteSearchRequest["priority"] = "interactive", roomId = "room-a"): RouteSearchRequest { return { roomId, sessionId, requestId: id, revision: 1, start: { x: 0, z: 0 }, destination: { x: 3, z: 0 }, priority }; }
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const resolvesWithin = async (promise: Promise<unknown>, timeoutMs = 25) => Promise.race([
  promise.then(() => true),
  new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
]);

test("pool bounds workers and pending work globally, per room, and per session", async () => {
  const workers: FakeWorker[] = [];
  const pool = new RouteSearchPool({ workerCount: 1, globalQueueLimit: 2, roomQueueLimit: 1, sessionQueueLimit: 1, workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  pool.setSnapshot(snapshot);
  pool.setSnapshot({ ...snapshot, roomId: "room-b" });
  const first = pool.submit(request("active", "one"));
  const duplicateSession = pool.submit(request("duplicate", "one"));
  const queued = pool.submit(request("queued", "two"));
  const roomCap = pool.submit(request("room-cap", "three"));
  const secondQueued = pool.submit(request("second-queued", "four", "interactive", "room-b"));
  const globalCap = pool.submit(request("global-cap", "five", "interactive", "room-b"));
  assert.equal(first.admission.status, "queued");
  assert.deepEqual(duplicateSession.admission, { status: "busy", requestId: "duplicate", reason: "session-cap" });
  assert.equal(queued.admission.status, "queued");
  assert.deepEqual(roomCap.admission, { status: "busy", requestId: "room-cap", reason: "room-cap" });
  assert.equal(secondQueued.admission.status, "queued");
  assert.deepEqual(globalCap.admission, { status: "busy", requestId: "global-cap", reason: "global-cap" });
  assert.equal(pool.activeCount, 1); assert.equal(pool.pendingCount, 2); assert.equal(workers.length, 1);
  workers[0]!.respond(); await first.result; await flush(); workers[0]!.respond(); await queued.result; await flush(); workers[0]!.respond(); await secondQueued.result;
  await pool.dispose();
});

test("queued cancellation frees admission immediately and priority scheduling is weighted", async () => {
  const workers: FakeWorker[] = [];
  const pool = new RouteSearchPool({ workerCount: 1, workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  pool.setSnapshot(snapshot);
  pool.setSnapshot({ ...snapshot, roomId: "room-b" });
  const active = pool.submit(request("active", "s0"));
  const cancelled = pool.submit(request("cancel-me", "s1", "interactive"));
  const follow = pool.submit(request("follow", "s2", "follow"));
  const interactiveB = pool.submit(request("interactive-b", "s3", "interactive", "room-b"));
  assert.equal(pool.cancel(cancelled.admission.status === "queued" ? cancelled.admission.jobId : ""), true);
  assert.equal(await cancelled.result, null);
  const admittedAgain = pool.submit(request("replacement", "s1", "interactive"));
  assert.equal(admittedAgain.admission.status, "queued");
  workers[0]!.respond(); await active.result; await flush();
  assert.equal(workers[0]!.messages.filter((message) => message.type === "search").at(-1)?.request.requestId, "interactive-b");
  workers[0]!.respond(); await interactiveB.result; await flush();
  assert.equal(workers[0]!.messages.filter((message) => message.type === "search").at(-1)?.request.requestId, "follow");
  workers[0]!.respond(); await follow.result; await flush();
  assert.equal(workers[0]!.messages.filter((message) => message.type === "search").at(-1)?.request.requestId, "replacement");
  workers[0]!.respond(); await admittedAgain.result; await pool.dispose();
});

test("worker crash resolves active work as failed and replaces the worker", async () => {
  const workers: FakeWorker[] = [];
  const pool = new RouteSearchPool({ workerCount: 1, workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  pool.setSnapshot(snapshot);
  const submitted = pool.submit(request("crash", "s"));
  workers[0]!.fail();
  assert.equal(await submitted.result, null);
  await flush();
  assert.equal(workers.length, 2); assert.equal(workers[0]!.terminated, true);
  const retry = pool.submit(request("retry", "s"));
  workers[1]!.respond(); assert.deepEqual(await retry.result, { points: [{ x: 1, z: 2 }] });
  await pool.dispose();
});

test("worker timeout resolves active work and replaces the unresponsive worker", async () => {
  const workers: FakeWorker[] = [];
  const pool = new RouteSearchPool({ workerCount: 1, workerTimeoutMs: 50, workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  pool.setSnapshot(snapshot);
  const submitted = pool.submit(request("timeout", "s"));
  assert.equal(await submitted.result, null);
  await flush();
  assert.equal(workers.length, 2); assert.equal(workers[0]!.terminated, true);
  await pool.dispose();
});

test("stale geometry is rejected and room snapshots evict oldest cached room", async () => {
  const workers: FakeWorker[] = [];
  const pool = new RouteSearchPool({ workerCount: 1, snapshotLimit: 1, workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  pool.setSnapshot(snapshot);
  const stale = pool.submit(request("stale", "s", "interactive", "room-a"));
  assert.equal(stale.admission.status, "queued");
  assert.equal(pool.cancel(stale.admission.status === "queued" ? stale.admission.jobId : ""), false, "this increment does not claim to interrupt active searches");
  pool.setSnapshot({ ...snapshot, revision: 2 });
  const noSnapshot = pool.submit(request("evicted", "s2", "interactive", "room-a"));
  assert.deepEqual(noSnapshot.admission, { status: "busy", requestId: "evicted", reason: "stale-snapshot" });
  assert.equal(await stale.result, null, "snapshot updates resolve active callers immediately");
  workers[0]!.respond();
  await pool.dispose();
});

test("snapshot cache owns a clone and removing a room resolves active work without interrupting worker", async () => {
  const workers: FakeWorker[] = [];
  const pool = new RouteSearchPool({ workerCount: 1, workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  const mutable = structuredClone(snapshot);
  mutable.world.dynamicCollisionGrid = makeBlockerGrid([{ x: 0, z: 0, width: 1, depth: 1 }]);
  mutable.world.excludedVehiclePropId = "own-car";
  mutable.world.accessOverlay = [{ x: 0, z: 0, width: 2, depth: 2 }];
  pool.setSnapshot(mutable);
  mutable.world.width = 999;
  mutable.seatLayout!.props[0]!.x = 999;
  const submitted = pool.submit(request("remove", "session"));
  const sentSnapshot = workers[0]!.messages.find((message) => message.type === "snapshot").snapshot;
  assert.equal(sentSnapshot.world.width, snapshot.world.width, "cache does not retain caller-mutable geometry");
  assert.equal(sentSnapshot.world.dynamicCollisionGrid, undefined);
  assert.equal(sentSnapshot.world.excludedVehiclePropId, undefined);
  assert.equal(sentSnapshot.world.accessOverlay, undefined);
  assert.equal(sentSnapshot.seatLayout.props[0].x, 1, "cached seat geometry is cloned once with the static snapshot");
  assert.equal(pool.removeSnapshot("room-a"), true);
  assert.equal(await submitted.result, null, "active caller is released immediately when room geometry is removed");
  assert.equal(pool.activeCount, 1, "the synchronous worker search remains occupied until its response");
  workers[0]!.respond();
  await pool.dispose();
});

test("per-request dynamic and access overlays affect route search without copying cached static geometry", () => {
  const staticGrid = makeBlockerGrid([]);
  const staticWorld = { ...snapshot.world, width: 20, depth: 20, playerRadius: 0.3, walls: [], obstacles: [], collisionGrid: staticGrid };
  const staticSnapshot: RouteSearchSnapshot = { roomId: "overlay-test", revision: 7, world: staticWorld };
  const start = { x: -6, z: 0 }, destination = { x: 6, z: 0 };
  const directRequest = { ...request("direct", "session", "interactive", "overlay-test"), start, destination };
  const directWorld = routeSearchWorld(staticSnapshot, directRequest);
  assert.deepEqual(findAutoRoute(start, destination, directWorld), [destination]);

  const vehicleBlocker = { x: 0, z: 0, width: 2, depth: 8, vehiclePropId: "parked-car" };
  const dynamicGrid = makeBlockerGrid([vehicleBlocker]);
  const dynamicRequest = { ...directRequest, requestId: "dynamic", dynamicCollisionGrid: dynamicGrid };
  const dynamicWorld = routeSearchWorld(staticSnapshot, dynamicRequest);
  const detour = findAutoRoute(start, destination, dynamicWorld);
  assert.ok(detour && detour.some(point => Math.abs(point.z) > 0.5), "dynamic vehicle overlay forces a detour");
  assert.equal(dynamicWorld.collisionGrid, staticGrid, "static grid is shared by identity");
  assert.equal(dynamicWorld.walls, staticWorld.walls);
  assert.equal(dynamicWorld.obstacles, staticWorld.obstacles);
  assert.equal(staticSnapshot.world.dynamicCollisionGrid, undefined, "cached base snapshot has no dynamic layer");

  const deniedBarrier = { x: 0, z: 0, width: 1, depth: 30 };
  const accessRequest = { ...directRequest, requestId: "access", accessBlockers: [deniedBarrier] };
  const accessWorld = routeSearchWorld(staticSnapshot, accessRequest);
  assert.equal(findAutoRoute(start, destination, accessWorld), null, "server-derived access overlay blocks crossing");
  assert.equal(accessWorld.collisionGrid, staticGrid, "access overlay does not copy the cached static grid");
  assert.equal(staticSnapshot.world.accessOverlay, undefined, "per-user access never enters shared snapshot");
});

test("snapshot-limit eviction invalidates active results immediately while the worker finishes", async () => {
  const workers: FakeWorker[] = [];
  const pool = new RouteSearchPool({ workerCount: 1, snapshotLimit: 1, workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  pool.setSnapshot(snapshot);
  const submitted = pool.submit(request("evict-active", "session"));
  pool.setSnapshot({ ...snapshot, roomId: "room-b" });
  assert.equal(await submitted.result, null);
  assert.equal(pool.activeCount, 1);
  workers[0]!.respond();
  await pool.dispose();
});

test("session and room cancellation use job identity when requestIds collide", async () => {
  const workers: FakeWorker[] = [];
  const pool = new RouteSearchPool({ workerCount: 1, workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  pool.setSnapshot(snapshot);
  pool.setSnapshot({ ...snapshot, roomId: "room-b" });

  const blocker = pool.submit(request("blocker", "blocker"));
  const otherSessionRoom = pool.submit(request("same-request-id", "other", "interactive", "room-b"));
  const sameRoomOtherSession = pool.submit(request("same-request-id", "same-room-other"));
  const sessionTarget = pool.submit(request("same-request-id", "victim"));
  assert.equal(pool.cancelSession("room-a", "victim"), 1);
  assert.equal(await resolvesWithin(sessionTarget.result), true, "the selected session's request resolves as cancelled");
  assert.equal(pool.pendingCount, 2, "same requestId in another session/room remains queued");
  workers[0]!.respond(); await blocker.result; await flush();
  assert.equal(workers[0]!.messages.filter((message) => message.type === "search").at(-1)?.request.sessionId, "other");
  workers[0]!.respond(); assert.ok(await otherSessionRoom.result); await flush();
  workers[0]!.respond(); assert.ok(await sameRoomOtherSession.result);

  const roomBlocker = pool.submit(request("room-blocker", "room-blocker", "interactive", "room-b"));
  const otherRoom = pool.submit(request("same-request-id", "other-room-session", "interactive", "room-b"));
  const roomVictim = pool.submit(request("same-request-id", "room-victim", "interactive", "room-a"));
  assert.equal(pool.cancelRoom("room-a"), 1);
  assert.equal(await resolvesWithin(roomVictim.result), true, "the selected room's request resolves as cancelled");
  assert.equal(pool.pendingCount, 1, "same requestId from the earlier unrelated room remains queued");
  workers[0]!.respond(); await roomBlocker.result; await flush();
  workers[0]!.respond(); assert.ok(await otherRoom.result);
  await pool.dispose();
});

test("unexpected clean worker exit is replaced and hard caps prevent oversized configuration", async () => {
  const workers: FakeWorker[] = [];
  const pool = new RouteSearchPool({ workerCount: 99, globalQueueLimit: 99_999, workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  assert.equal(workers.length, 4, "worker count is hard capped");
  pool.setSnapshot(snapshot);
  workers[0]!.emit("exit", 0);
  await flush();
  assert.equal(workers.length, 5, "unexpected exit code zero replaces the worker");
  const submitted = pool.submit(request("after-exit", "session"));
  workers[4]!.respond(); assert.ok(await submitted.result);
  await pool.dispose();
});

test("dispose drains queued/active promises and terminates bounded workers", async () => {
  const workers: FakeWorker[] = [];
  const pool = new RouteSearchPool({ workerCount: 2, workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } });
  pool.setSnapshot(snapshot);
  const first = pool.submit(request("first", "s1")); const second = pool.submit(request("second", "s2")); const queued = pool.submit(request("queued", "s3"));
  await pool.dispose();
  assert.equal(await first.result, null); assert.equal(await second.result, null); assert.equal(await queued.result, null);
  assert.equal(workers.length, 2); assert.ok(workers.every((worker) => worker.terminated));
});

test("real worker resolves a bounded route burst and releases all jobs on shutdown", async () => {
  const pool = new RouteSearchPool({ workerCount: 2 });
  try {
    pool.setSnapshot(snapshot);
    const jobs = Array.from({ length: 12 }, (_, index) => pool.submit(request(`real-${index}`, `session-${index}`)));
    assert.ok(jobs.every(job => job.admission.status === "queued"));
    assert.ok(pool.activeCount <= 2);
    const results = await Promise.all(jobs.map(job => job.result));
    for (const result of results) {
      assert.deepEqual(result?.points, [{ x: 3, z: 0 }]);
    }
    assert.equal(pool.activeCount, 0);
    assert.equal(pool.pendingCount, 0);
  } finally {
    await pool.dispose();
  }
  assert.equal(pool.submit(request("after-dispose", "session")).admission.status, "busy");
});
