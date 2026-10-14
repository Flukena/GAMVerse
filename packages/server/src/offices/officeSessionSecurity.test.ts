import assert from "node:assert/strict";
import test, { mock, after } from "node:test";
import type { AuthContext, Client } from "@colyseus/core";
import { DEFAULT_CHARACTER_ID, PlayerState } from "@gammyverse/shared";
import { Spotlight, OFFICE_ACCESS_REVOKED_CLOSE_CODE } from "./spotlight.js";

// Load the database boundary in this isolated test process; no connection is made.
process.env.PGDATABASE = "session-security-test";
const { database } = await import("../infra/db.js");
const { OfficeRoom } = await import("./OfficeRoom.js");
const OFFICE_ID = "session-security-office";
const USERNAME = "alice";
const SESSION_ID = "original-session";
const REPLACEMENT_SESSION_ID = "replacement-session";
const SESSION_TOKEN = "test-session-token";
const TRANSPORT_DROP_CLOSE_CODE = 1006;
const MEMBERSHIP_SQL_LABEL = "SELECT offices.owner_username";
const SESSION_SQL_LABEL = "FROM app_sessions";
const ACTIVE_ACCOUNT_ROW = { username: USERNAME, character_id: DEFAULT_CHARACTER_ID, is_maintainer: false };
const MEMBERSHIP_ROW = { owner_username: USERNAME, membership_role: "user" };

interface RoomInternals {
  officeId: string;
  spotlight: Spotlight;
  usernamesBySessionId: Map<string, string>;
  activeClientByUsername?: Map<string, string>;
  movementInputs: Map<string, unknown>;
  sessionSecurity?: { activate(username: string, id: string, token?: string): void };
}
interface Registry { roomsByOffice: Map<string, Set<InstanceType<typeof OfficeRoom>>> }
const registry = OfficeRoom as unknown as Registry;
after(async () => { await database?.end(); });

function fixture() {
  const room = new OfficeRoom();
  const internals = room as unknown as RoomInternals;
  internals.officeId = OFFICE_ID;
  internals.usernamesBySessionId.set(SESSION_ID, USERNAME);
  internals.activeClientByUsername?.set(USERNAME, SESSION_ID);
  internals.sessionSecurity?.activate(USERNAME, SESSION_ID, SESSION_TOKEN);
  const player = new PlayerState();
  player.username = USERNAME;
  player.presence = "online";
  room.state.players.set(SESSION_ID, player);
  let rotations = 0;
  const spotlight = new Spotlight(OFFICE_ID, {
    role: async () => "owner",
    revoke: async () => {},
    changed: () => { rotations += 1; },
  });
  internals.spotlight = spotlight;
  const leaveCodes: number[] = [];
  const client = {
    sessionId: SESSION_ID,
    auth: { role: "user" },
    send: () => {},
    leave: (code: number) => { leaveCodes.push(code); },
  } as unknown as Client;
  let rejectSeat!: (error: Error) => void;
  const seat = Object.assign(new Promise<Client>((_resolve, reject) => { rejectSeat = reject; }), {
    reject: (error: Error) => { seatRejected = true; rejectSeat(error); },
  });
  let seatRejected = false;
  // Only replace the transport boundary; every security/restore method is real.
  mock.method(room, "allowReconnection", () => seat);
  registry.roomsByOffice.set(OFFICE_ID, new Set([room]));
  return { room, internals, player, client, spotlight, leaveCodes,
    rotations: () => rotations, seatRejected: () => seatRejected,
    cleanup: () => { room.clock.stop(); registry.roomsByOffice.delete(OFFICE_ID); mock.restoreAll(); },
  };
}
function queryBoundary(accountActive = true, membership?: Promise<unknown>) {
  assert.ok(database);
  mock.method(database, "query", async (sql: string) => {
    if (sql.includes(SESSION_SQL_LABEL)) return { rows: accountActive ? [ACTIVE_ACCOUNT_ROW] : [] };
    if (sql.includes(MEMBERSHIP_SQL_LABEL)) return membership ?? { rows: [MEMBERSHIP_ROW] };
    return { rows: [] };
  });
}

test("OfficeRoom drop then suspension rejects seat and never restores revoked state", async () => {
  const f = fixture();
  try {
    queryBoundary(false);
    f.room.onDrop(f.client, TRANSPORT_DROP_CLOSE_CODE);
    OfficeRoom.kickAccountFromAllOffices(USERNAME);
    await f.room.onReconnect(f.client);
    assert.equal(f.player.presence, "away");
    assert.equal(f.seatRejected(), true);
    assert.deepEqual(f.leaveCodes, [OFFICE_ACCESS_REVOKED_CLOSE_CODE]);
    assert.equal(f.rotations(), 1);
    f.room.onLeave(f.client, OFFICE_ACCESS_REVOKED_CLOSE_CODE);
    assert.equal(f.rotations(), 1);
  } finally { f.cleanup(); }
});

test("OfficeRoom closes dropped publisher immediately and rotates once through final leave/dispose", async () => {
  const f = fixture();
  try {
    await f.spotlight.command(USERNAME, { targetUsername: USERNAME, on: true });
    const before = f.rotations();
    f.room.onDrop(f.client, TRANSPORT_DROP_CLOSE_CODE);
    OfficeRoom.closeOffice(OFFICE_ID);
    assert.equal(f.seatRejected(), true);
    assert.deepEqual(f.spotlight.snapshot().usernames, []);
    assert.equal(f.rotations() - before, 1);
    f.room.onLeave(f.client);
    f.room.onDispose();
    assert.equal(f.rotations() - before, 1);
  } finally { f.cleanup(); }
});

test("OfficeRoom replacement while membership query waits cannot restore stale session", async () => {
  const f = fixture();
  let resolveMembership!: (value: unknown) => void;
  let membershipStarted!: () => void;
  const started = new Promise<void>(resolve => { membershipStarted = resolve; });
  const membership = new Promise(resolve => { resolveMembership = resolve; });
  try {
    assert.ok(database);
    mock.method(database, "query", async (sql: string) => {
      if (sql.includes(SESSION_SQL_LABEL)) return { rows: [ACTIVE_ACCOUNT_ROW] };
      if (sql.includes(MEMBERSHIP_SQL_LABEL)) { membershipStarted(); return membership; }
      return { rows: [] };
    });
    f.room.onDrop(f.client, TRANSPORT_DROP_CLOSE_CODE);
    const reconnect = f.room.onReconnect(f.client);
    await started;
    f.internals.activeClientByUsername?.set(USERNAME, REPLACEMENT_SESSION_ID);
    f.internals.sessionSecurity?.activate(USERNAME, REPLACEMENT_SESSION_ID, SESSION_TOKEN);
    f.room.state.players.delete(SESSION_ID);
    resolveMembership({ rows: [MEMBERSHIP_ROW] });
    await reconnect;
    assert.equal(f.player.presence, "away");
    assert.equal(f.internals.movementInputs.has(SESSION_ID), false);
    assert.deepEqual(f.leaveCodes, [OFFICE_ACCESS_REVOKED_CLOSE_CODE]);
  } finally { f.cleanup(); }
});

test("OfficeRoom ordinary drop reconnects active member without rotating", async () => {
  const f = fixture();
  try {
    queryBoundary();
    f.room.onDrop(f.client, TRANSPORT_DROP_CLOSE_CODE);
    await f.room.onReconnect(f.client);
    assert.equal(f.player.presence, "online");
    assert.equal(f.internals.movementInputs.has(SESSION_ID), true);
    assert.equal(f.rotations(), 0);
    assert.deepEqual(f.leaveCodes, []);
  } finally { f.cleanup(); }
});

test("OfficeRoom rechecks suspension using token retained by real onAuth and onJoin", async () => {
  const f = fixture();
  try {
    queryBoundary();
    const context = { headers: new Headers({
      origin: "http://localhost:5173", cookie: `gv_session=${SESSION_TOKEN}`,
    }) } as AuthContext;
    const auth = await f.room.onAuth(f.client, { officeId: OFFICE_ID }, context);
    f.room.onJoin(f.client, {}, auth);
    queryBoundary(false);
    f.room.onDrop(f.client, TRANSPORT_DROP_CLOSE_CODE);
    await f.room.onReconnect(f.client);
    assert.equal(f.room.state.players.get(SESSION_ID)?.presence, "away");
    assert.deepEqual(f.leaveCodes, [OFFICE_ACCESS_REVOKED_CLOSE_CODE]);
    assert.equal(f.rotations(), 1);
  } finally { f.cleanup(); }
});

test("OfficeRoom query rejection denies reconnect with security rotation and 4003", async () => {
  const f = fixture();
  try {
    assert.ok(database);
    mock.method(database, "query", async () => { throw new Error("account query unavailable"); });
    f.room.onDrop(f.client, TRANSPORT_DROP_CLOSE_CODE);
    await f.room.onReconnect(f.client);
    assert.equal(f.player.presence, "away");
    assert.deepEqual(f.leaveCodes, [OFFICE_ACCESS_REVOKED_CLOSE_CODE]);
    assert.equal(f.seatRejected(), true);
    assert.equal(f.rotations(), 1);
  } finally { f.cleanup(); }
});

test("OfficeRoom disposal rejects dropped seats and rotates once before terminal callback", async () => {
  const f = fixture();
  try {
    await f.spotlight.command(USERNAME, { targetUsername: USERNAME, on: true });
    const before = f.rotations();
    f.room.onDrop(f.client, TRANSPORT_DROP_CLOSE_CODE);
    f.room.onDispose();
    assert.equal(f.seatRejected(), true);
    assert.deepEqual(f.spotlight.snapshot().usernames, []);
    assert.equal(f.rotations() - before, 1);
    f.room.onLeave(f.client, OFFICE_ACCESS_REVOKED_CLOSE_CODE);
    f.room.onDispose();
    assert.equal(f.rotations() - before, 1);
  } finally { f.cleanup(); }
});

test("OfficeRoom closure rejects seats in multiple rooms sharing one spotlight and rotates once", async () => {
  const first = fixture();
  const second = fixture();
  second.internals.spotlight = first.spotlight;
  registry.roomsByOffice.set(OFFICE_ID, new Set([first.room, second.room]));
  try {
    await first.spotlight.command(USERNAME, { targetUsername: USERNAME, on: true });
    const before = first.rotations();
    first.room.onDrop(first.client, TRANSPORT_DROP_CLOSE_CODE);
    second.room.onDrop(second.client, TRANSPORT_DROP_CLOSE_CODE);
    OfficeRoom.closeOffice(OFFICE_ID);
    assert.equal(first.seatRejected(), true);
    assert.equal(second.seatRejected(), true);
    assert.equal(first.rotations() - before, 1);
    first.room.onLeave(first.client);
    second.room.onLeave(second.client);
    first.room.onDispose();
    second.room.onDispose();
    assert.equal(first.rotations() - before, 1);
  } finally { first.cleanup(); second.cleanup(); }
});

test("OfficeRoom suspension covers connected and dropped rooms sharing one spotlight without duplicate rotation", () => {
  const connected = fixture();
  const dropped = fixture();
  dropped.internals.spotlight = connected.spotlight;
  registry.roomsByOffice.set(OFFICE_ID, new Set([connected.room, dropped.room]));
  connected.room.clients.push(connected.client);
  try {
    dropped.room.onDrop(dropped.client, TRANSPORT_DROP_CLOSE_CODE);
    assert.equal(OfficeRoom.kickAccountFromAllOffices(USERNAME), 1);
    assert.deepEqual(connected.leaveCodes, [OFFICE_ACCESS_REVOKED_CLOSE_CODE]);
    assert.equal(dropped.seatRejected(), true);
    assert.equal(connected.rotations(), 1);
    connected.room.onDrop(connected.client, OFFICE_ACCESS_REVOKED_CLOSE_CODE);
    connected.room.onLeave(connected.client, OFFICE_ACCESS_REVOKED_CLOSE_CODE);
    dropped.room.onLeave(dropped.client, OFFICE_ACCESS_REVOKED_CLOSE_CODE);
    assert.equal(connected.rotations(), 1);
  } finally { connected.cleanup(); dropped.cleanup(); }
});
