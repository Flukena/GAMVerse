import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { PlayerState } from "@gammyverse/shared";
import { DeskMessages } from "./deskMessages.js";
import { OfficeRoom } from "./OfficeRoom.js";

const OFFICE_ID = "00000000-0000-4000-8000-000000000007";
const SESSION_ID = "availability-session";
const MOVE_INTENT = { x: 1, z: 0, sprint: false };
type Handler = (client: { sessionId: string; send(event: string, payload: unknown): void }, payload: unknown) => void;

test("Busy, meeting and explicit Away accept movement intent in the actual room handler", async () => {
  const room = new OfficeRoom();
  const handlers = new Map<string, Handler>();
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", (event: string, handler: Handler) => { handlers.set(event, handler); return () => {}; });
  mock.method(console, "info", () => {});
  try {
    await room.onCreate({ officeId: OFFICE_ID });
    const internals = room as unknown as { movementInputs: Map<string, { x: number }>; lastPacketAt: Map<string, number>; autoRoutes: Map<string, unknown>; routeWorkLimiter: {forget(sessionId:string):void} };
    const player = new PlayerState();
    player.x = 0; player.z = 0; player.vehicleId = "";
    room.state.players.set(SESSION_ID, player);
    for (const status of ["do-not-disturb", "in-meeting", "away"]) {
      player.status = status;
      internals.lastPacketAt.clear();
      handlers.get("input")!({ sessionId: SESSION_ID, send() {} }, MOVE_INTENT);
      assert.equal(internals.movementInputs.get(SESSION_ID)?.x, MOVE_INTENT.x, status);
      internals.autoRoutes.clear();
      internals.routeWorkLimiter.forget(SESSION_ID);
      handlers.get("auto-move")!({ sessionId: SESSION_ID, send() {} }, { x: 2, z: 0 });
      assert.equal(internals.autoRoutes.has(SESSION_ID), true, `${status} accepts navigation`);
    }
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
