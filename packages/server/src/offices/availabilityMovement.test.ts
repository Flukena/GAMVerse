import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { makeBlockerGrid, PlayerState, PRIVATE_ADMISSION_TTL_MS, ROOM_PROP_CATALOG, roomPropSeatAnchors, roomPropSeatReference, roomLayoutZoneAt, type RoomLayout, type RoomLayoutProp, type WorldConfig } from "@gammyverse/shared";
import { RoomSeatIndex } from "./roomSeatIndex.js";
import { DeskMessages } from "./deskMessages.js";
import { OfficeRoom } from "./OfficeRoom.js";
import { RouteSearchBudget } from "./routeWorkBudget.js";
import { executeRouteSearch } from "./routeSearchExecution.js";
import type { RouteSearchRequest, RouteSearchSnapshot } from "./routeSearchProtocol.js";
import type { PrivateConversations } from "./privateConversations.js";
import type { SessionSecurity } from "./sessionSecurity.js";
import { realtimeRuntimeMetrics } from "../infra/realtimeRuntimeMetrics.js";

const OFFICE_ID = "00000000-0000-4000-8000-000000000007";
const SESSION_ID = "availability-session";
const MOVE_INTENT = { x: 1, z: 0, sprint: false };
const SEAT_DEFINITION = ROOM_PROP_CATALOG.find(item => item.interaction === "sit")!;
const seatProp = (id: string, x = 0, z = 0): RoomLayoutProp => ({ id, asset: SEAT_DEFINITION.asset, x, z, width: 1, depth: 1, rotation: 0, collision: false });

test("actual room ticks use parsed zones and indexed seats, recheck occupancy and invalidate map edits", async () => {
  const room = new OfficeRoom();
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {});
  mock.method(console, "info", () => {});
  let nowMs = 10_000;
  mock.method(performance, "now", () => nowMs);
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as {
      step(dt: number): void; applyMapConfig(config: unknown, version: number): void;
      mapLayout: RoomLayout; mapConfig: unknown; seatIndex: RoomSeatIndex;
      pendingSitsBySessionId: Map<string, unknown>;
      movementInputs: Map<string, { x: number; z: number; sprint: boolean; receivedAt: number }>;
    };
    const config = { version: 1, layout: { version: 1, dimensions: { width: 50, depth: 50 }, props: [seatProp("chair")], zones: [], walls: [], doors: [] } };
    internals.applyMapConfig(config, 2);
    const player = new PlayerState(); player.presence = "online"; player.x = 0; player.z = 1.5; player.sittingPropId = "";
    room.state.players.set(SESSION_ID, player);
    internals.movementInputs.set(SESSION_ID, { x: 0, z: 0, sprint: false, receivedAt: nowMs });
    // A steady-state tick must not even read the raw map. Boundary parsing is done.
    internals.mapConfig = new Proxy({}, { get() { throw new Error("hot-path map normalization"); } });
    const nearest = mock.method(internals.seatIndex, "nearest");
    internals.step(0.02);
    assert.equal(internals.pendingSitsBySessionId.has(SESSION_ID), true);
    nowMs += 100;
    internals.step(0.02);
    assert.equal(nearest.mock.callCount(), 1);
    const other = new PlayerState(); other.presence = "online"; other.x = 20; other.z = 20; other.sittingPropId = roomPropSeatReference("chair", 0);
    room.state.players.set("second", other);
    nowMs += 3_000;
    internals.step(0.02);
    assert.equal(player.sittingPropId, "", "pending seat cannot be taken twice");
    room.state.players.delete("second");
    nowMs += 250; internals.step(0.02);
    nowMs += 3_000; internals.step(0.02);
    assert.equal(player.sittingPropId, roomPropSeatReference("chair", 0));
    internals.movementInputs.set(SESSION_ID, { x: 1, z: 0, sprint: false, receivedAt: nowMs });
    internals.step(0.02);
    assert.equal(player.sittingPropId, "", "movement stands up from the walkable point");
    internals.movementInputs.set(SESSION_ID, { x: 0, z: 0, sprint: false, receivedAt: nowMs });
    nowMs += 250; internals.step(0.02);
    assert.equal(internals.pendingSitsBySessionId.has(SESSION_ID), true);
    internals.applyMapConfig({ ...config, layout: { ...config.layout, props: [] } }, 3);
    assert.equal(internals.pendingSitsBySessionId.size, 0);
    assert.equal(internals.seatIndex.nearest(player, 3, new Set()), undefined);
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});

test("seat approach uses one bounded worker request and rechecks occupancy before route install", async () => {
  const room = new OfficeRoom();
  const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown }; const previousPool = roomClass.routeSearchPool;
  const requests: Array<{ priority: string; mode?: string; seatSearch?: { zoneId: string; occupiedSeatIds: string[] } }> = [];
  let cachedSeatProps: RoomLayoutProp[] = [];
  let complete!: (value: { points: { x: number; z: number }[] | null; propId?: string; zoneId?: string }) => void;
  roomClass.routeSearchPool = {
    setSnapshot: (snapshot: { seatLayout?: { props: RoomLayoutProp[] } }) => { cachedSeatProps = snapshot.seatLayout?.props ?? []; return true; },
    submit: (request: typeof requests[number]) => {
      requests.push(request);
      return { admission: { status: "queued", requestId: `seat-${requests.length}`, jobId: `seat-job-${requests.length}` }, result: new Promise(resolve => { complete = resolve; }) };
    },
    cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
  };
  mock.method(room, "setMetadata", async () => {}); mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {}); mock.method(room, "broadcast", () => {}); mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const zone = { id: "meeting", kind: "meeting" as const, name: "Meeting", x: 0, z: 0, width: 10, depth: 10, color: "#ffffff" };
    const layout = { version: 1, dimensions: { width: 50, depth: 50 }, props: [seatProp("meeting-chair")], zones: [zone], walls: [], doors: [] };
    const internals = room as unknown as {
      applyMapConfig(config: unknown, version: number): void;
      routeToAvailableSeat(sessionId: string, player: PlayerState, zoneId: string, budget: RouteSearchBudget): boolean;
      pendingSeatSearchBySessionId: Map<string, unknown>; autoRoutes: Map<string, { sitOnArrivalPropId?: string }>;
      invalidateRouteIntent(sessionId: string): void;
    };
    internals.applyMapConfig({ version: 1, layout }, 2);
    const player = new PlayerState(); player.presence = "online"; player.x = -3; player.z = 0;
    room.state.players.set(SESSION_ID, player);
    assert.equal(internals.routeToAvailableSeat(SESSION_ID, player, zone.id, new RouteSearchBudget()), true);
    assert.equal(internals.routeToAvailableSeat(SESSION_ID, player, zone.id, new RouteSearchBudget()), true);
    assert.equal(requests.length, 1, "ticks do not queue duplicate seat searches");
    assert.equal(requests[0]?.priority, "seat"); assert.equal(requests[0]?.mode, "seat");
    assert.deepEqual(requests[0]?.seatSearch?.occupiedSeatIds, []);
    assert.equal(requests[0]?.seatSearch?.zoneId, zone.id);
    assert.equal(cachedSeatProps[0]?.id, "meeting-chair", "static seat props are cached once with the room snapshot");
    const occupant = new PlayerState(); occupant.presence = "online"; occupant.sittingPropId = roomPropSeatReference("meeting-chair", 0);
    room.state.players.set("other-session", occupant);
    complete({ points: [{ x: 0, z: 2 }], propId: roomPropSeatReference("meeting-chair", 0), zoneId: zone.id });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(internals.pendingSeatSearchBySessionId.has(SESSION_ID), false);
    assert.equal(internals.autoRoutes.has(SESSION_ID), false, "a seat claimed while searching is not routed to");
  } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
});

test("seat approach worker result is discarded after navigation intent changes", async () => {
  const room = new OfficeRoom(); const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown }; const previousPool = roomClass.routeSearchPool;
  let complete!: (value: { points: { x: number; z: number }[] | null; propId?: string; zoneId?: string }) => void;
  roomClass.routeSearchPool = {
    setSnapshot: () => true,
    submit: () => ({ admission: { status: "queued", requestId: "seat-stale", jobId: "seat-stale" }, result: new Promise(resolve => { complete = resolve; }) }),
    cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
  };
  mock.method(room, "setMetadata", async () => {}); mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {}); mock.method(room, "broadcast", () => {}); mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const zone = { id: "meeting", kind: "meeting" as const, name: "Meeting", x: 0, z: 0, width: 10, depth: 10, color: "#ffffff" };
    const layout = { version: 1, dimensions: { width: 50, depth: 50 }, props: [seatProp("meeting-chair")], zones: [zone], walls: [], doors: [] };
    const internals = room as unknown as {
      applyMapConfig(config: unknown, version: number): void;
      routeToAvailableSeat(sessionId: string, player: PlayerState, zoneId: string, budget: RouteSearchBudget): boolean;
      invalidateRouteIntent(sessionId: string): void; autoRoutes: Map<string, unknown>;
    };
    internals.applyMapConfig({ version: 1, layout }, 2);
    const player = new PlayerState(); player.presence = "online"; player.x = -3; player.z = 0;
    room.state.players.set(SESSION_ID, player);
    internals.routeToAvailableSeat(SESSION_ID, player, zone.id, new RouteSearchBudget());
    internals.invalidateRouteIntent(SESSION_ID);
    complete({ points: [{ x: 0, z: 2 }], propId: roomPropSeatReference("meeting-chair", 0), zoneId: zone.id });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(internals.autoRoutes.has(SESSION_ID), false, "stale seat result cannot resurrect an old arrival intent");
  } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
});

test("actual arrival tick stops after the worker confirms every seat is occupied", async () => {
  const room = new OfficeRoom(); const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown }; const previousPool = roomClass.routeSearchPool;
  let snapshot: RouteSearchSnapshot | undefined; let searches = 0;
  roomClass.routeSearchPool = {
    setSnapshot: (value: RouteSearchSnapshot) => { snapshot = value; return true; },
    submit: (request: RouteSearchRequest) => {
      searches += 1;
      const result = executeRouteSearch(snapshot!, request);
      return { admission: { status: "queued", requestId: request.requestId, jobId: `seat-${searches}` }, result: Promise.resolve(result) };
    },
    cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
  };
  mock.method(room, "setMetadata", async () => {}); mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {}); mock.method(room, "broadcast", () => {}); mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const zone = { id: "meeting", kind: "meeting" as const, name: "Meeting", x: 0, z: 0, width: 10, depth: 10, color: "#ffffff" };
    const chair = seatProp("occupied-chair");
    const internals = room as unknown as {
      applyMapConfig(config: unknown, version: number): void; step(dt: number): void;
      movementInputs: Map<string, { x: number; z: number; sprint: boolean; receivedAt: number }>;
      autoRoutes: Map<string, { points: { x: number; z: number }[]; index: number; stalledTicks: number; sitOnArrivalZoneId?: string }>;
    };
    internals.applyMapConfig({ version: 1, layout: { version: 1, dimensions: { width: 50, depth: 50 }, props: [chair], zones: [zone], walls: [], doors: [] } }, 2);
    const player = new PlayerState(); player.presence = "online"; player.x = -3; player.z = 0;
    room.state.players.set(SESSION_ID, player);
    const sendEvents: Array<{ event: string; payload: unknown }> = [];
    const client = { sessionId: SESSION_ID, send: (event: string, payload: unknown) => sendEvents.push({ event, payload }) };
    (room.clients as unknown as unknown[]).push(client);
    for (const anchor of roomPropSeatAnchors(chair, SEAT_DEFINITION)) {
      const occupant = new PlayerState(); occupant.presence = "online"; occupant.sittingPropId = roomPropSeatReference(chair.id, anchor.index);
      room.state.players.set(`occupant-${anchor.index}`, occupant);
    }
    internals.autoRoutes.set(SESSION_ID, { points: [], index: 0, stalledTicks: 0, sitOnArrivalZoneId: zone.id });
    internals.movementInputs.set(SESSION_ID, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
    for (let tick = 0; tick < 5; tick += 1) { internals.step(0.02); await new Promise<void>(resolve => setImmediate(resolve)); }
    assert.equal(searches, 1, "definitive no-seat result ends arrival instead of retrying forever");
    assert.equal(internals.autoRoutes.has(SESSION_ID), false);
    assert.equal(sendEvents.some(({ event, payload }) => event === "auto-move-status" && typeof payload === "object" && payload !== null && "status" in payload && payload.status === "arrived"), true);
  } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
});

test("actual arrival ticks cap retries when the route-search adapter rejects", async () => {
  const room = new OfficeRoom(); const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown }; const previousPool = roomClass.routeSearchPool;
  let searches = 0;
  roomClass.routeSearchPool = {
    setSnapshot: () => true,
    submit: () => {
      searches += 1;
      return { admission: { status: "queued", requestId: `seat-failed-${searches}`, jobId: `seat-failed-${searches}` }, result: Promise.reject(new Error("worker adapter rejected")) };
    },
    cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
  };
  mock.method(room, "setMetadata", async () => {}); mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {}); mock.method(room, "broadcast", () => {}); mock.method(console, "info", () => {});
  let nowMs = 10_000;
  mock.method(performance, "now", () => nowMs);
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const zone = { id: "meeting", kind: "meeting" as const, name: "Meeting", x: 0, z: 0, width: 10, depth: 10, color: "#ffffff" };
    const internals = room as unknown as {
      applyMapConfig(config: unknown, version: number): void; step(dt: number): void;
      movementInputs: Map<string, { x: number; z: number; sprint: boolean; receivedAt: number }>;
      autoRoutes: Map<string, { points: { x: number; z: number }[]; index: number; stalledTicks: number; sitOnArrivalZoneId?: string }>;
    };
    internals.applyMapConfig({ version: 1, layout: { version: 1, dimensions: { width: 50, depth: 50 }, props: [seatProp("retry-chair")], zones: [zone], walls: [], doors: [] } }, 2);
    const player = new PlayerState(); player.presence = "online"; player.x = -3; player.z = 0;
    room.state.players.set(SESSION_ID, player);
    const sendEvents: Array<{ event: string; payload: unknown }> = [];
    (room.clients as unknown as unknown[]).push({ sessionId: SESSION_ID, send: (event: string, payload: unknown) => sendEvents.push({ event, payload }) });
    internals.autoRoutes.set(SESSION_ID, { points: [], index: 0, stalledTicks: 0, sitOnArrivalZoneId: zone.id });
    internals.movementInputs.set(SESSION_ID, { x: 0, z: 0, sprint: false, receivedAt: nowMs });
    for (let tick = 0; tick < 20; tick += 1) {
      internals.step(0.02);
      await new Promise<void>(resolve => setImmediate(resolve));
      nowMs += 251;
    }
    assert.equal(searches, 4, "adapter rejection retries are capped at the configured attempt bound");
    assert.equal(internals.autoRoutes.has(SESSION_ID), false, "exhausted search clears the retained arrival route");
    assert.equal(sendEvents.some(({ event, payload }) => event === "auto-move-status" && typeof payload === "object" && payload !== null && "status" in payload && payload.status === "arrived"), true);
  } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
});

test("OfficeRoom conversation planners submit public and paired meeting searches to the shared worker pool", async () => {
  const room = new OfficeRoom(); const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown }; const previousPool = roomClass.routeSearchPool;
  let snapshot: RouteSearchSnapshot | undefined; const modes: Array<RouteSearchRequest["mode"]> = [];
  roomClass.routeSearchPool = {
    setSnapshot: (value: RouteSearchSnapshot) => { snapshot = value; return true; },
    submit: (request: RouteSearchRequest) => {
      modes.push(request.mode);
      return { admission: { status: "queued", requestId: request.requestId, jobId: request.requestId }, result: Promise.resolve(executeRouteSearch(snapshot!, request)) };
    },
    cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
  };
  mock.method(room, "setMetadata", async () => {}); mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {}); mock.method(room, "broadcast", () => {}); mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as {
      applyMapConfig(config: unknown, version: number): void;
      navigationGeometry(): { world: WorldConfig; layout: RoomLayout; lockedZoneIds: ReadonlySet<string>; revision: number };
      searchPublicConversationRoute(participant: { username: string; sessionId: string; displayName: string; x: number; z: number; status: string; presence: string; vehicleId: string; active: boolean }, target: { x: number; z: number }, geometry: { world: WorldConfig; layout: RoomLayout; lockedZoneIds: ReadonlySet<string>; revision: number }): Promise<unknown>;
      searchMeetingRoomRoutes(from: { username: string; sessionId: string; displayName: string; x: number; z: number; status: string; presence: string; vehicleId: string; active: boolean }, to: { username: string; sessionId: string; displayName: string; x: number; z: number; status: string; presence: string; vehicleId: string; active: boolean }, geometry: { world: WorldConfig; layout: RoomLayout; lockedZoneIds: ReadonlySet<string>; revision: number }, zone: RoomLayout["zones"][number]): Promise<unknown>;
    };
    const zone = { id: "meeting", kind: "meeting" as const, name: "Meeting", x: 0, z: 10, width: 10, depth: 10, color: "#ffffff" };
    internals.applyMapConfig({ version: 1, layout: { version: 1, dimensions: { width: 40, depth: 40 }, props: [], zones: [zone], walls: [], doors: [] } }, 2);
    const alice = new PlayerState(); alice.displayName = "Alice"; alice.presence = "online"; alice.status = "available"; alice.x = -6; alice.z = 0;
    const bob = new PlayerState(); bob.displayName = "Bob"; bob.presence = "online"; bob.status = "available"; bob.x = 6; bob.z = 0;
    room.state.players.set("alice", alice); room.state.players.set("bob", bob);
    const from = { username: "alice", sessionId: "alice", displayName: "Alice", x: alice.x, z: alice.z, status: "available", presence: "online", vehicleId: "", active: true };
    const to = { username: "bob", sessionId: "bob", displayName: "Bob", x: bob.x, z: bob.z, status: "available", presence: "online", vehicleId: "", active: true };
    const geometry = internals.navigationGeometry();
    assert.ok(await internals.searchPublicConversationRoute(from, { x: 6, z: 0 }, geometry));
    assert.ok(await internals.searchMeetingRoomRoutes(from, to, geometry, zone));
    assert.deepEqual(modes, ["approach", "meet-room"]);
  } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
});

test("parsed room zones preserve overlaps, exit hysteresis and locked entry after accepted edits", async () => {
  const room = new OfficeRoom();
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {});
  mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as {
      applyMapConfig(config: unknown, version: number): void; step(dt: number): void;
      updatePlayerMediaZone(session: string, player: PlayerState): unknown;
      canEnterMediaZone(session: string, zone: string): boolean;
      mediaZoneBySessionId: Map<string, { id: string }>;
      movementInputs: Map<string, { x: number; z: number; sprint: boolean; receivedAt: number }>;
      mapConfig: unknown;
    };
    const zone = { id: "outer", kind: "meeting", name: "Outer", x: 0, z: 0, width: 8, depth: 8, color: "#ffffff" };
    const config = { version: 1, layout: { version: 1, props: [], walls: [], doors: [], zones: [zone, { ...zone, id: "inner", width: 4, depth: 4 }], dimensions: { width: 50, depth: 50 } } };
    internals.applyMapConfig(config, 2);
    const player = new PlayerState(); player.presence = "online";
    room.state.players.set(SESSION_ID, player);
    internals.mapConfig = new Proxy({}, { get() { throw new Error("hot-path zone normalization"); } });
    let previous: string | undefined;
    for (const x of [0, 2.3, 2.6, 4.3, 4.6, 0]) {
      player.x = x; player.z = 0;
      const expected = roomLayoutZoneAt(player, config, previous)?.id;
      internals.updatePlayerMediaZone(SESSION_ID, player);
      assert.equal(internals.mediaZoneBySessionId.get(SESSION_ID)?.id, expected, `x=${x}`);
      previous = expected;
    }
    const edited = { ...config, layout: { ...config.layout, zones: [{ ...zone, x: 15 }] } };
    internals.applyMapConfig(edited, 3);
    assert.equal(internals.mediaZoneBySessionId.has(SESSION_ID), false, "old zone membership is invalidated");
    mock.method(internals, "canEnterMediaZone", () => false);
    player.x = 10.99; player.z = 0;
    internals.movementInputs.set(SESSION_ID, { x: 1, z: 0, sprint: false, receivedAt: performance.now() });
    internals.mapConfig = new Proxy({}, { get() { throw new Error("hot-path locked entry normalization"); } });
    internals.step(0.02);
    assert.ok(player.x < 11, "server rejects entry into a denied room");
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});

type Handler = (client: { sessionId: string; send(event: string, payload: unknown): void }, payload: unknown) => void;

test("Busy, meeting and explicit Away accept movement intent in the actual room handler", async () => {
  const room = new OfficeRoom();
  const handlers = new Map<string, Handler>();
  const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown };
  const previousPool = roomClass.routeSearchPool;
  roomClass.routeSearchPool = {
    setSnapshot: () => true,
    submit: () => ({ admission: { status: "queued", requestId: "test", jobId: "test" }, result: Promise.resolve({ points: [{ x: 2, z: 0 }] }) }),
    cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
  };
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
  mock.method(room, "broadcast", () => {});
  mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as { movementInputs: Map<string, { x: number }>; lastPacketAt: Map<string, number>; autoRoutes: Map<string, unknown>; routeWorkLimiter: {forget(sessionId:string):void} };
    const player = new PlayerState();
    player.x = 0; player.z = 0; player.vehicleId = "";
    room.state.players.set(SESSION_ID, player);
    const client = { sessionId: SESSION_ID, send() {} };
    (room.clients as unknown as unknown[]).push(client);
    for (const status of ["do-not-disturb", "in-meeting", "away"]) {
      player.status = status;
      internals.lastPacketAt.clear();
      handlers.get("input")!({ sessionId: SESSION_ID, send() {} }, MOVE_INTENT);
      assert.equal(internals.movementInputs.get(SESSION_ID)?.x, MOVE_INTENT.x, status);
      internals.autoRoutes.clear();
      internals.routeWorkLimiter.forget(SESSION_ID);
      handlers.get("auto-move")!(client, { x: 2, z: 0 });
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(internals.autoRoutes.has(SESSION_ID), true, `${status} accepts navigation`);
    }
  } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
});

test("worker route results are discarded after intent, map, access, or session changes", async () => {
  for (const invalidation of ["intent", "map", "access", "disconnect"] as const) {
    const room = new OfficeRoom();
    const handlers = new Map<string, Handler>();
    const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown };
    const previousPool = roomClass.routeSearchPool;
    let complete!: (value: { points: { x: number; z: number }[] }) => void;
    roomClass.routeSearchPool = {
      setSnapshot: () => true,
      submit: () => ({ admission: { status: "queued", requestId: "pending", jobId: "pending" }, result: new Promise(resolve => { complete = resolve; }) }),
      cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
    };
    mock.method(room, "setMetadata", async () => {});
    mock.method(room, "setFixedTimestep", () => {});
    mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
    mock.method(room, "broadcast", () => {});
    mock.method(console, "info", () => {});
    try {
      await room.onCreate({ officeId: OFFICE_ID });
      const internals = room as unknown as {
        applyMapConfig(config: unknown, version: number): void; refreshPrivateAccess(): void;
        privacy: PrivateConversations; sessionSecurity: SessionSecurity; autoRoutes: Map<string, unknown>;
        lastPacketAt: Map<string, number>; movementInputs: Map<string, { x: number }>;
      };
      const zone = { id: "meeting", kind: "meeting" as const, name: "Meeting", x: 4, z: 0, width: 4, depth: 4, color: "#ffffff" };
      internals.applyMapConfig({ version: 1, layout: { version: 1, dimensions: { width: 50, depth: 50 }, props: [], walls: [], doors: [], zones: [zone] } }, 2);
      const player = new PlayerState(); player.presence = "online"; player.username = "alice"; player.x = 0; player.z = 0;
      room.state.players.set(SESSION_ID, player);
      internals.sessionSecurity.activate("alice", SESSION_ID);
      const events: unknown[] = [];
      const client = { sessionId: SESSION_ID, send: (_event: string, payload: unknown) => events.push(payload) };
      (room.clients as unknown as unknown[]).push(client);
      internals.lastPacketAt.clear();
      handlers.get("auto-move")!(client, { x: 4, z: 0 });
      assert.equal(typeof complete, "function", "route search was admitted");
      if (invalidation === "intent") {
        internals.lastPacketAt.clear();
        handlers.get("input")!(client, MOVE_INTENT);
        assert.equal(events.some(event => typeof event === "object" && event !== null && "status" in event && event.status === "cancelled"), true, "superseded request reports cancellation");
      } else if (invalidation === "map") {
        internals.applyMapConfig({ version: 1, layout: { version: 1, dimensions: { width: 50, depth: 50 }, props: [], walls: [], doors: [], zones: [] } }, 3);
      } else if (invalidation === "access") {
        const other = new PlayerState(); other.presence = "online"; other.username = "bob";
        room.state.players.set("another-member", other);
        internals.sessionSecurity.activate("bob", "another-member");
        internals.refreshPrivateAccess();
        internals.privacy.access.lockForMeeting(zone.id, [SESSION_ID, "another-member"], Date.now());
        internals.refreshPrivateAccess();
      } else {
        (room.clients as unknown as unknown[]).splice(0, 1);
        room.state.players.delete(SESSION_ID);
      }
      complete({ points: [{ x: 1, z: 0 }] });
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(internals.autoRoutes.has(SESSION_ID), false, `${invalidation} invalidates pending route`);
      assert.equal(Boolean(player.vehicleId), false, `${invalidation} does not commit a temporary vehicle`);
      assert.equal(events.some(event => typeof event === "object" && event !== null && "status" in event && event.status === "started"), false);
    } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
  }
});

test("worker routes are fenced immediately when access is revoked or the office closes", async () => {
  for (const action of ["revoke", "close"] as const) {
    const room = new OfficeRoom(); const handlers = new Map<string, Handler>();
    const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown };
    const previousPool = roomClass.routeSearchPool;
    let complete!: (value: { points: { x: number; z: number }[] }) => void;
    roomClass.routeSearchPool = {
      setSnapshot: () => true,
      submit: () => ({ admission: { status: "queued", requestId: action, jobId: action }, result: new Promise(resolve => { complete = resolve; }) }),
      cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
    };
    mock.method(room, "setMetadata", async () => {}); mock.method(room, "setFixedTimestep", () => {});
    mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
    mock.method(room, "broadcast", () => {}); mock.method(console, "info", () => {});
    try {
      await room.onCreate({ officeId: OFFICE_ID });
      const player = new PlayerState(); player.presence = "online"; player.username = "alice"; player.x = 0; player.z = 0;
      room.state.players.set(SESSION_ID, player);
      const security = (room as unknown as { sessionSecurity: SessionSecurity }).sessionSecurity;
      security.activate("alice", SESSION_ID);
      const internals = room as unknown as { usernamesBySessionId: Map<string, string>; revokeUsername(username: string, reason: string, spotlights: Set<unknown>): number };
      internals.usernamesBySessionId.set(SESSION_ID, "alice");
      const client = { sessionId: SESSION_ID, send() {}, leave() {} }; (room.clients as unknown as unknown[]).push(client);
      handlers.get("auto-move")!(client, { x: 4, z: 0 });
      if (action === "revoke") internals.revokeUsername("alice", "revoked", new Set());
      else OfficeRoom.closeOffice(OFFICE_ID);
      complete({ points: [{ x: 1, z: 0 }] }); await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(Boolean(player.vehicleId), false, `${action} does not mount a temporary vehicle`);
      assert.equal((room as unknown as { autoRoutes: Map<string, unknown> }).autoRoutes.has(SESSION_ID), false);
    } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
  }
});

test("expired admission fences a pending route through a still-locked zone without a map revision", async () => {
  const room = new OfficeRoom(); const handlers = new Map<string, Handler>();
  const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown }; const previousPool = roomClass.routeSearchPool;
  let complete!: (value: { points: { x: number; z: number }[] }) => void;
  roomClass.routeSearchPool = {
    setSnapshot: () => true,
    submit: () => ({ admission: { status: "queued", requestId: "expires", jobId: "expires" }, result: new Promise(resolve => { complete = resolve; }) }),
    cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
  };
  mock.method(room, "setMetadata", async () => {}); mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
  mock.method(room, "broadcast", () => {}); mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const zone = { id: "crossing", kind: "meeting" as const, name: "Meeting", x: 5, z: 0, width: 4, depth: 4, color: "#ffffff" };
    const internals = room as unknown as {
      applyMapConfig(config: unknown, version: number): void; refreshPrivateAccess(): void; privacy: PrivateConversations;
      usernamesBySessionId: Map<string, string>; navigationGeometryRevision: number;
    };
    internals.applyMapConfig({ version: 1, layout: { version: 1, dimensions: { width: 50, depth: 50 }, props: [], walls: [], doors: [], zones: [zone] } }, 2);
    const player = new PlayerState(); player.presence = "online"; player.username = "alice"; player.x = 0; player.z = 0;
    const other = new PlayerState(); other.presence = "online"; other.username = "bob"; other.x = 10; other.z = 0;
    room.state.players.set(SESSION_ID, player); room.state.players.set("other", other);
    internals.usernamesBySessionId.set(SESSION_ID, "alice"); internals.usernamesBySessionId.set("other", "bob");
    const security = (room as unknown as { sessionSecurity: SessionSecurity }).sessionSecurity;
    security.activate("alice", SESSION_ID); security.activate("bob", "other");
    internals.refreshPrivateAccess();
    internals.privacy.access.lockForMeeting(zone.id, [SESSION_ID, "other"], Date.now());
    internals.refreshPrivateAccess();
    const geometryRevision = internals.navigationGeometryRevision;
    const accessInternals = internals.privacy.access as unknown as { zones: Map<string, { admissions: Map<string, { sessionId: string; username: string; displayName: string; expiresAtMs: number | null }> }> };
    accessInternals.zones.get(zone.id)!.admissions.set(SESSION_ID, { sessionId: SESSION_ID, username: "alice", displayName: "Alice", expiresAtMs: Date.now() + 60_000 });
    const client = { sessionId: SESSION_ID, send() {} }; (room.clients as unknown as unknown[]).push(client);
    handlers.get("auto-move")!(client, { x: 10, z: 0 });
    accessInternals.zones.get(zone.id)!.admissions.get(SESSION_ID)!.expiresAtMs = Date.now() - 1;
    internals.refreshPrivateAccess();
    complete({ points: [{ x: 10, z: 0 }] }); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(internals.navigationGeometryRevision, geometryRevision, "only caller access changed; zone geometry/lock remained stable");
    assert.equal(Boolean(player.vehicleId), false, "expired admission cannot commit a route through the locked zone");
  } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
});

test("departed session intent revisions are removed without allowing a reused id to inherit them", async () => {
  const room = new OfficeRoom();
  mock.method(room, "setMetadata", async () => {}); mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {}); mock.method(room, "broadcast", () => {}); mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as {
      routeIntentRevisionBySessionId: Map<string, number>; pendingRouteSearchBySessionId: Map<string, number>;
      invalidateRouteIntent(sessionId: string): void; clearSessionState(sessionId: string): void;
    };
    internals.invalidateRouteIntent(SESSION_ID);
    const departedRevision = internals.routeIntentRevisionBySessionId.get(SESSION_ID)!;
    internals.pendingRouteSearchBySessionId.set(SESSION_ID, departedRevision);
    internals.clearSessionState(SESSION_ID);
    assert.equal(internals.routeIntentRevisionBySessionId.has(SESSION_ID), false);
    assert.equal(internals.pendingRouteSearchBySessionId.has(SESSION_ID), false);
    internals.invalidateRouteIntent(SESSION_ID);
    assert.notEqual(internals.routeIntentRevisionBySessionId.get(SESSION_ID), departedRevision);
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});

test("move-to-player commits a worker route only after rechecking the live target", async () => {
  const room = new OfficeRoom();
  const handlers = new Map<string, Handler>();
  const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown };
  const previousPool = roomClass.routeSearchPool;
  roomClass.routeSearchPool = {
    setSnapshot: () => true,
    submit: () => ({ admission: { status: "queued", requestId: "move-target", jobId: "move-target" }, result: Promise.resolve({ points: [{ x: 3, z: 0 }] }) }),
    cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
  };
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
  mock.method(room, "broadcast", () => {});
  mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as { autoRoutes: Map<string, unknown> };
    const follower = new PlayerState(); follower.presence = "online"; follower.x = 0; follower.z = 0;
    const target = new PlayerState(); target.presence = "online"; target.x = 5; target.z = 0;
    room.state.players.set(SESSION_ID, follower);
    room.state.players.set("target-session", target);
    const events: unknown[] = [];
    const client = { sessionId: SESSION_ID, send: (_event: string, payload: unknown) => events.push(payload) };
    (room.clients as unknown as unknown[]).push(client);
    handlers.get("auto-move-to-player")!(client, { targetSessionId: "target-session" });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(internals.autoRoutes.has(SESSION_ID), true);
    assert.equal(Boolean(follower.vehicleId), true);
    assert.equal(events.some(event => typeof event === "object" && event !== null && "status" in event && event.status === "started"), true);
  } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
});

test("unrelated dynamic vehicle refreshes preserve pending routes and reuse the static snapshot", async () => {
  const room = new OfficeRoom();
  const handlers = new Map<string, Handler>();
  const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown };
  const previousPool = roomClass.routeSearchPool;
  let snapshotInstalls = 0;
  const pending: Array<(value: { points: { x: number; z: number }[] }) => void> = [];
  roomClass.routeSearchPool = {
    setSnapshot: () => { snapshotInstalls += 1; return true; },
    submit: () => ({ admission: { status: "queued", requestId: `request-${pending.length}`, jobId: `job-${pending.length}` }, result: new Promise(resolve => { pending.push(resolve); }) }),
    cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
  };
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
  mock.method(room, "broadcast", () => {});
  mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as {
      world: WorldConfig; autoRoutes: Map<string, unknown>; routeWorkLimiter: { forget(sessionId: string): void };
      refreshVehicleCollisionWorlds(): void; vehicleCollisionIndex: { update(...args: unknown[]): WorldConfig };
    };
    let dynamicGrid = makeBlockerGrid([{ x: 15, z: 15, width: 1, depth: 1, vehiclePropId: "moving-car" }]);
    const player = new PlayerState(); player.presence = "online"; player.x = 0; player.z = 0;
    room.state.players.set(SESSION_ID, player);
    const client = { sessionId: SESSION_ID, send() {} };
    (room.clients as unknown as unknown[]).push(client);
    handlers.get("auto-move")!(client, { x: 4, z: 0 });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(snapshotInstalls, 1);
    assert.equal(pending.length, 1);

    mock.method(internals.vehicleCollisionIndex, "update", () => ({
      ...internals.world,
      dynamicCollisionGrid: dynamicGrid,
    }));
    internals.refreshVehicleCollisionWorlds();
    pending[0]!({ points: [{ x: 1, z: 0 }] });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(internals.autoRoutes.has(SESSION_ID), true, "a route clear of the latest dynamic blocker remains usable");
    assert.equal(Boolean(player.vehicleId), true, "safe worker result can mount its temporary vehicle");

    internals.routeWorkLimiter.forget(SESSION_ID);
    handlers.get("auto-move")!(client, { x: 3, z: 0 });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(pending.length, 2);
    assert.equal(snapshotInstalls, 1, "a dynamic-only update reuses the room's immutable static snapshot");
    dynamicGrid = makeBlockerGrid([{ x: 1, z: 0, width: 1, depth: 1, vehiclePropId: "route-blocker" }]);
    internals.refreshVehicleCollisionWorlds();
    pending[1]!({ points: [{ x: 1, z: 0 }] });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(internals.autoRoutes.has(SESSION_ID), false, "a route crossing a newly moved vehicle is rejected at commit");
  } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
});

test("first no-vehicle route is revalidated against a live car entering its path", async () => {
  const room = new OfficeRoom(); const handlers = new Map<string, Handler>();
  const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown }; const previousPool = roomClass.routeSearchPool;
  let complete!: (value: { points: { x: number; z: number }[] }) => void;
  roomClass.routeSearchPool = {
    setSnapshot: () => true,
    submit: () => ({ admission: { status: "queued", requestId: "first-drive", jobId: "first-drive" }, result: new Promise(resolve => { complete = resolve; }) }),
    cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
  };
  mock.method(room, "setMetadata", async () => {}); mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
  mock.method(room, "broadcast", () => {}); mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as { world: WorldConfig; vehicleCollisionIndex: { update(...args: unknown[]): WorldConfig }; refreshVehicleCollisionWorlds(): void; autoRoutes: Map<string, unknown> };
    let dynamicGrid = undefined as WorldConfig["dynamicCollisionGrid"];
    mock.method(internals.vehicleCollisionIndex, "update", () => ({ ...internals.world, dynamicCollisionGrid: dynamicGrid }));
    const player = new PlayerState(); player.presence = "online"; player.x = 0; player.z = 0;
    room.state.players.set(SESSION_ID, player);
    const client = { sessionId: SESSION_ID, send() {} }; (room.clients as unknown as unknown[]).push(client);
    handlers.get("auto-move")!(client, { x: 4, z: 0 });
    assert.equal(Boolean(player.vehicleId), false, "the first request begins on foot");
    dynamicGrid = makeBlockerGrid([{ x: 1.5, z: 0, width: 1, depth: 1, vehiclePropId: "entering-car" }]);
    internals.refreshVehicleCollisionWorlds();
    complete({ points: [{ x: 3, z: 0 }] });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(internals.autoRoutes.has(SESSION_ID), false, "commit uses the updated dynamic grid");
    assert.equal(Boolean(player.vehicleId), false, "a stale path cannot mount a temporary vehicle");
  } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
});

test("move-to-player discards a result when the target moves or is replaced while pending", async () => {
  for (const change of ["move", "replace"] as const) {
    const room = new OfficeRoom();
    const handlers = new Map<string, Handler>();
    const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown };
    const previousPool = roomClass.routeSearchPool;
    let complete!: (value: { points: { x: number; z: number }[] }) => void;
    roomClass.routeSearchPool = {
      setSnapshot: () => true,
      submit: () => ({ admission: { status: "queued", requestId: change, jobId: change }, result: new Promise(resolve => { complete = resolve; }) }),
      cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
    };
    mock.method(room, "setMetadata", async () => {}); mock.method(room, "setFixedTimestep", () => {});
    mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
    mock.method(room, "broadcast", () => {}); mock.method(console, "info", () => {});
    try {
      await room.onCreate({ officeId: OFFICE_ID });
      const follower = new PlayerState(); follower.presence = "online"; follower.x = 0; follower.z = 0;
      const target = new PlayerState(); target.presence = "online"; target.x = 5; target.z = 0;
      room.state.players.set(SESSION_ID, follower); room.state.players.set("target-session", target);
      const client = { sessionId: SESSION_ID, send() {} }; (room.clients as unknown as unknown[]).push(client);
      handlers.get("auto-move-to-player")!(client, { targetSessionId: "target-session" });
      if (change === "move") target.x = 9;
      else { const replacement = new PlayerState(); replacement.presence = "online"; replacement.x = 5; room.state.players.set("target-session", replacement); }
      complete({ points: [{ x: 3, z: 0 }] }); await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(Boolean(follower.vehicleId), false, `${change} target does not mount a temporary vehicle`);
      assert.equal((room as unknown as { autoRoutes: Map<string, unknown> }).autoRoutes.has(SESSION_ID), false);
    } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
  }
});

test("initial follow uses a worker route, tick repaths stay unique, and stop fences the pending result", async () => {
  const room = new OfficeRoom();
  const handlers = new Map<string, Handler>();
  const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown };
  const previousPool = roomClass.routeSearchPool;
  let nowMs = 10_000;
  const pending: Array<{ request: { priority: string }; resolve: (value: { points: { x: number; z: number }[] }) => void }> = [];
  roomClass.routeSearchPool = {
    setSnapshot: () => true,
    submit: (request: { priority: string }) => ({
      admission: { status: "queued", requestId: `follow-${pending.length}`, jobId: `follow-${pending.length}` },
      result: new Promise(resolve => { pending.push({ request, resolve }); }),
    }),
    cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
  };
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
  mock.method(room, "broadcast", () => {});
  mock.method(performance, "now", () => nowMs);
  mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as { activeFollowsBySessionId: Map<string, { repathPending?: boolean }>; autoRoutes: Map<string, unknown>; step(dt: number): void };
    const follower = new PlayerState(); follower.presence = "online"; follower.x = 0; follower.z = 0;
    const target = new PlayerState(); target.presence = "online"; target.x = 5; target.z = 0; target.displayName = "Target";
    room.state.players.set(SESSION_ID, follower); room.state.players.set("target-session", target);
    const followerEvents: unknown[] = []; const targetEvents: unknown[] = [];
    const followerClient = { sessionId: SESSION_ID, send: (_event: string, payload: unknown) => followerEvents.push(payload) };
    const targetClient = { sessionId: "target-session", send: (_event: string, payload: unknown) => targetEvents.push(payload) };
    (room.clients as unknown as unknown[]).push(followerClient, targetClient);

    handlers.get("follow-player")!(followerClient, { targetSessionId: "target-session" });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.request.priority, "follow");
    assert.equal(followerEvents.some(event => typeof event === "object" && event !== null && "status" in event && event.status === "started"), false);
    pending[0]!.resolve({ points: [{ x: 3.65, z: 0 }] });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(internals.activeFollowsBySessionId.has(SESSION_ID), true);
    assert.equal(internals.autoRoutes.has(SESSION_ID), true);
    assert.equal(followerEvents.some(event => typeof event === "object" && event !== null && "status" in event && event.status === "started"), true);
    assert.equal(targetEvents.some(event => typeof event === "object" && event !== null && "followerSessionId" in event), true);

    const currentRoute = internals.autoRoutes.get(SESSION_ID);
    target.x = 6;
    nowMs += 600;
    internals.step(0.02);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(pending.length, 2, "target movement schedules one worker repath");
    for (let index = 0; index < 4; index += 1) { nowMs += 600; internals.step(0.02); }
    assert.equal(pending.length, 2, "ticks do not duplicate an outstanding repath");
    assert.equal(internals.autoRoutes.get(SESSION_ID), currentRoute, "the previous route stays active during repath");

    handlers.get("follow-stop")!(followerClient, "");
    pending[1]!.resolve({ points: [{ x: 4.65, z: 0 }] });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(internals.activeFollowsBySessionId.has(SESSION_ID), false);
    assert.equal(internals.autoRoutes.has(SESSION_ID), false, "stopped follow is not resurrected by a late result");
  } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
});

test("initial follow discards results after target movement or departure", async () => {
  for (const change of ["movement", "departure"] as const) {
    const room = new OfficeRoom();
    const handlers = new Map<string, Handler>();
    const roomClass = OfficeRoom as unknown as { routeSearchPool?: unknown };
    const previousPool = roomClass.routeSearchPool;
    let complete!: (value: { points: { x: number; z: number }[] }) => void;
    roomClass.routeSearchPool = {
      setSnapshot: () => true,
      submit: () => ({ admission: { status: "queued", requestId: "follow", jobId: "follow" }, result: new Promise(resolve => { complete = resolve; }) }),
      cancelRoom: () => {}, cancelSession: () => {}, cancel: () => false, dispose: async () => {},
    };
    mock.method(room, "setMetadata", async () => {});
    mock.method(room, "setFixedTimestep", () => {});
    mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
    mock.method(room, "broadcast", () => {});
    mock.method(console, "info", () => {});
    try {
      await room.onCreate({ officeId: OFFICE_ID });
      const internals = room as unknown as { autoRoutes: Map<string, unknown> };
      const follower = new PlayerState(); follower.presence = "online"; follower.x = 0; follower.z = 0;
      const target = new PlayerState(); target.presence = "online"; target.x = 5; target.z = 0;
      room.state.players.set(SESSION_ID, follower); room.state.players.set("target-session", target);
      const events: unknown[] = [];
      const client = { sessionId: SESSION_ID, send: (_event: string, payload: unknown) => events.push(payload) };
      const targetClient = { sessionId: "target-session", send() {} };
      (room.clients as unknown as unknown[]).push(client, targetClient);
      handlers.get("follow-player")!(client, { targetSessionId: "target-session" });
      if (change === "movement") target.x = 7;
      else room.onLeave(targetClient as never);
      complete({ points: [{ x: 3.65, z: 0 }] });
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(internals.autoRoutes.has(SESSION_ID), false, `${change} must not commit a stale route`);
      assert.equal(events.some(event => typeof event === "object" && event !== null && "status" in event && event.status === "started"), false);
    } finally { room.onDispose(); room.clock.stop(); roomClass.routeSearchPool = previousPool; mock.restoreAll(); }
  }
});

test("stationary realtime ticks expire unused private meeting reservations while rate-limiting seats", async () => {
  const room = new OfficeRoom();
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {});
  mock.method(console, "info", () => {});
  let nowMs = 100_000;
  mock.method(Date, "now", () => nowMs);
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as {
      step(deltaSeconds: number): void;
      applyMapConfig(config: unknown, version: number): void;
      refreshPrivateAccess(): void;
      privacy: PrivateConversations;
      sessionSecurity: SessionSecurity;
      lockedZoneIds: Set<string>;
      movementInputs: Map<string, { x: number; z: number; sprint: boolean; receivedAt: number }>;
      autoSitScanAtBySessionId: Map<string, number>;
    };
    const zoneId = "reserved-meeting";
    internals.applyMapConfig({ version: 1, layout: { version: 1, dimensions: { width: 50, depth: 50 }, props: [], walls: [], doors: [], zones: [
      { id: zoneId, kind: "meeting", name: "Reserved", x: 15, z: 15, width: 4, depth: 4, color: "#ffffff" },
    ] } }, 2);
    for (const sessionId of [SESSION_ID, "other-session", "outsider"]) {
      const player = new PlayerState();
      player.x = 0; player.z = 0; player.presence = "online"; player.username = sessionId;
      room.state.players.set(sessionId, player);
      internals.sessionSecurity.activate(player.username, sessionId);
      internals.movementInputs.set(sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
    }
    internals.refreshPrivateAccess();
    internals.privacy.access.lockForMeeting(zoneId, [SESSION_ID, "other-session"], nowMs);
    internals.step(0.02);
    assert.equal(internals.lockedZoneIds.has(zoneId), true);
    assert.equal(internals.privacy.canEnter("outsider", zoneId), false);
    const nextSeatScanAt = internals.autoSitScanAtBySessionId.get(SESSION_ID);
    assert.ok(nextSeatScanAt);
    nowMs += PRIVATE_ADMISSION_TTL_MS;
    internals.step(0.02);
    assert.equal(internals.autoSitScanAtBySessionId.get(SESSION_ID), nextSeatScanAt);
    assert.equal(internals.lockedZoneIds.has(zoneId), false, "reservation expires without player movement");
    assert.equal(internals.privacy.lockedIds().has(zoneId), false);
    assert.equal(internals.privacy.canEnter("outsider", zoneId), true);
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});

test("idle players skip repeated movement work until their next seat scan, while fresh facing input is applied", async () => {
  const room = new OfficeRoom();
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {});
  mock.method(console, "info", () => {});
  let nowMs = 100_000;
  mock.method(performance, "now", () => nowMs);
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as {
      step(dt: number): void;
      movementInputs: Map<string, { x: number; z: number; sprint: boolean; receivedAt: number; facingYaw?: number }>;
      autoSitScanAtBySessionId: Map<string, number>;
    };
    for (const id of ["idle-a", "idle-b"]) {
      const player = new PlayerState(); player.presence = "online";
      room.state.players.set(id, player);
      internals.movementInputs.set(id, { x: 0, z: 0, sprint: false, receivedAt: nowMs });
      internals.autoSitScanAtBySessionId.set(id, nowMs + 250);
    }
    const before = realtimeRuntimeMetrics.snapshot().counters.stationaryTickSkips;
    internals.step(0.02);
    assert.equal(realtimeRuntimeMetrics.snapshot().counters.stationaryTickSkips - before, 2);

    internals.movementInputs.set("idle-a", { x: 0, z: 0, sprint: false, receivedAt: nowMs, facingYaw: 1 });
    internals.step(0.02);
    assert.equal(room.state.players.get("idle-a")!.rotation, 1, "a new facing intent is applied instead of fast-skipped");
    assert.equal(realtimeRuntimeMetrics.snapshot().counters.stationaryTickSkips - before, 3);
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});

test("teleport clears the seat-scan cooldown so its destination is scanned immediately", async () => {
  const room = new OfficeRoom();
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {});
  mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as {
      completeAutoMoveTeleport(client: { sessionId: string; send(): void }, player: PlayerState, landing: { x: number; z: number }): void;
      applyMapConfig(config: unknown, version: number): void;
      step(deltaSeconds: number): void;
      autoSitScanAtBySessionId: Map<string, number>;
      pendingSitsBySessionId: Map<string, unknown>;
    };
    internals.applyMapConfig({ version: 1, layout: { version: 1, dimensions: { width: 50, depth: 50 }, props: [seatProp("destination-chair")], zones: [], walls: [], doors: [] } }, 2);
    const player = new PlayerState(); player.presence = "online"; player.x = 20; player.z = 20;
    room.state.players.set(SESSION_ID, player);
    internals.autoSitScanAtBySessionId.set(SESSION_ID, performance.now() + 250);
    internals.completeAutoMoveTeleport({ sessionId: SESSION_ID, send() {} }, player, { x: 0, z: 1.5 });
    internals.step(0.02);
    assert.equal(internals.pendingSitsBySessionId.has(SESSION_ID), true);
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});

test("returning to a desk teleports to its center without creating a route", async () => {
  const room = new OfficeRoom();
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(console, "info", () => {});
  try {
    mock.method(room, "onMessage", () => () => {});
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as {
      mapLayout: { zones: Array<{ id: string; kind: "private"; name: string; ownerUsername: string; x: number; z: number; width: number; depth: number; color: string }> };
      startDeskRoute(sessionId: string, player: PlayerState, zone: unknown): unknown;
      autoRoutes: Map<string, unknown>;
      canEnterMediaZone(sessionId: string, zoneId: string): boolean;
    };
    mock.method(internals, "canEnterMediaZone", () => false);
    const player = new PlayerState(); player.username = "alice"; player.x = 0; player.z = 0; player.vehicleId = "";
    const zone = { id: "desk", kind: "private" as const, name: "Desk", ownerUsername: "alice", x: 0, z: 0, width: 4, depth: 4, color: "#ffffff" };
    internals.mapLayout.zones = [zone];
    room.state.players.set(SESSION_ID, player);
    player.x = -20;
    assert.equal(internals.startDeskRoute(SESSION_ID, player, zone), "arrived");
    assert.equal(internals.autoRoutes.has(SESSION_ID), false);
    assert.equal(player.x, 0); assert.equal(player.z, 0);
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});

test("returning to a desk teleports out of a vehicle even when a safe dismount is unavailable", async () => {
  const room = new OfficeRoom();
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(console, "info", () => {});
  try {
    mock.method(room, "onMessage", () => () => {});
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as {
      mapLayout: { zones: Array<{ id: string; kind: "private"; name: string; ownerUsername: string; x: number; z: number; width: number; depth: number; color: string }> };
      startDeskRoute(sessionId: string, player: PlayerState, zone: unknown): unknown;
      autoRoutes: Map<string, unknown>;
      exitVehicle(sessionId: string, player: PlayerState): boolean;
    };
    mock.method(internals, "exitVehicle", () => false);
    const player = new PlayerState();
    player.username = "alice"; player.x = -20; player.z = 0; player.vehicleId = "auto-car"; player.vehicleMode = "auto";
    const zone = { id: "desk", kind: "private" as const, name: "Desk", ownerUsername: "alice", x: 0, z: 0, width: 4, depth: 4, color: "#ffffff" };
    internals.mapLayout.zones = [zone];
    room.state.players.set(SESSION_ID, player);
    assert.equal(internals.startDeskRoute(SESSION_ID, player, zone), "arrived");
    assert.equal(internals.autoRoutes.has(SESSION_ID), false);
    assert.equal(player.x, 0); assert.equal(player.z, 0);
    assert.equal(player.vehicleId, "");
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});

test("office maintainers can acquire the map edit lock", async () => {
  const room = new OfficeRoom();
  const handlers = new Map<string, Handler>();
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(console, "info", () => {});
  try {
    mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as { officeRolesBySessionId: Map<string, string>; usernamesBySessionId: Map<string, string> };
    internals.officeRolesBySessionId.set(SESSION_ID, "maintainer");
    internals.usernamesBySessionId.set(SESSION_ID, "alice");
    const results: unknown[] = [];
    handlers.get("map-edit-lock")!({ sessionId: SESSION_ID, send: (event, payload) => { if (event === "map-edit-lock-result") results.push(payload); } }, { active: true });
    assert.deepEqual(results, [{ granted: true }]);
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});


test("actual movement, cancel and map handlers invalidate a delayed desk lookup", async () => {
  for (const action of ["input", "auto-move-cancel", "map"] as const) {
    const room = new OfficeRoom();
    const handlers = new Map<string, Handler>();
    mock.method(room, "setMetadata", async () => {});
    mock.method(room, "setFixedTimestep", () => {});
    mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
    mock.method(console, "info", () => {});
    try {
      await room.onCreate({ officeId: OFFICE_ID });
      const player = new PlayerState(); player.username = "alice";
      room.state.players.set(SESSION_ID, player);
      let finish!: () => void;
      let starts = 0;
      const zone = { id: "desk", kind: "private" as const, name: "Desk", ownerUsername: "alice", x: 0, z: 0, width: 4, depth: 4, color: "#ffffff" };
      const messages = new DeskMessages(OFFICE_ID, { username: () => "alice", player: () => player, start: () => { starts += 1; return "started"; } }, {
        destination: () => new Promise(resolve => { finish = () => resolve({ desk: { id: OFFICE_ID, officeId: OFFICE_ID, zoneId: zone.id, ownerUsername: "alice" }, zone }); }),
      });
      const internals = room as unknown as { deskTravel: DeskMessages; applyMapConfig(config: unknown): void };
      internals.deskTravel = messages;
      const events: unknown[] = [];
      const client = { sessionId: SESSION_ID, send: (_event: string, payload: unknown) => { events.push(payload); } };
      const command = messages.command(client, { deskId: OFFICE_ID });
      if (action === "map") internals.applyMapConfig({ version: 1, layout: { props: [], zones: [], walls: [], doors: [] } });
      else handlers.get(action)!(client, MOVE_INTENT);
      const before = events.length;
      finish(); await command;
      assert.equal(starts, 0, action);
      assert.equal(events.length, before, `${action} suppresses late feedback`);
    } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
  }
});
