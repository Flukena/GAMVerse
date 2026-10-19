import assert from "node:assert/strict";
import test, { mock, after } from "node:test";
import type { AuthContext, Client } from "@colyseus/core";
import { DEFAULT_CHARACTER_ID, PlayerState, defaultAvailability } from "@gammyverse/shared";
import { getRecentServerErrorCount } from "../infra/logger.js";
import { Spotlight, OFFICE_ACCESS_REVOKED_CLOSE_CODE } from "./spotlight.js";

// Load the database boundary in this isolated test process; no connection is made.
process.env.PGDATABASE = "session-security-test";
const { database } = await import("../infra/db.js");
const { OfficeRoom } = await import("./OfficeRoom.js");
const { listOffices } = await import("./repository.js");
const OFFICE_ID = "session-security-office";
const VALID_OFFICE_ID = "12345678-1234-1234-1234-123456789abc";
const PEER_USERNAME = "bob";
const INVALID_ROOM_MAX_CLIENTS_LABEL = "invalid";
const USERNAME = "alice";
const SESSION_ID = "original-session";
const REPLACEMENT_SESSION_ID = "replacement-session";
const SESSION_TOKEN = "test-session-token";
const TRANSPORT_DROP_CLOSE_CODE = 1006;
const SERVER_SHUTDOWN_CLOSE_CODE = 4001;
const ROOM_DISPOSING_MESSAGE_LABEL = "disposing";
const KICK_REJECTION_LABEL = "kick";
const CLOSE_REJECTION_LABEL = "close";
const REPLACE_REJECTION_LABEL = "replace";
const RECONNECT_REJECTED_EVENT_LABEL = "office.client.reconnect.rejected";
const MEMBERSHIP_SQL_LABEL = "SELECT offices.owner_username";
const SESSION_SQL_LABEL = "FROM app_sessions";
const ACTIVE_ACCOUNT_ROW = { username: USERNAME, character_id: DEFAULT_CHARACTER_ID, is_maintainer: false };
const MEMBERSHIP_ROW = { owner_username: USERNAME, membership_role: "user" };

interface RoomInternals {
  officeId: string;
  spotlight: Spotlight;
  usernamesBySessionId: Map<string, string>;
  officeRolesBySessionId: Map<string, string>;
  movementInputs: Map<string, unknown>;
  sessionSecurity: { activate(username: string, id: string, token?: string): void; activeSession(username: string): string | undefined; finish(username: string, id: string): void; revoke(id: string): boolean };
}
interface Registry { roomsByOffice: Map<string, Set<InstanceType<typeof OfficeRoom>>> }
const registry = OfficeRoom as unknown as Registry;
after(async () => { await database?.end(); });

function fixture() {
  const room = new OfficeRoom();
  const internals = room as unknown as RoomInternals;
  internals.officeId = OFFICE_ID;
  internals.usernamesBySessionId.set(SESSION_ID, USERNAME);
  internals.sessionSecurity.activate(USERNAME, SESSION_ID, SESSION_TOKEN);
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
function authContext(): AuthContext {
  return { headers: new Headers({
    origin: "http://localhost:5173", cookie: `gv_session=${SESSION_TOKEN}`,
  }) } as AuthContext;
}

function queryBoundary(accountActive = true, membership?: Promise<unknown>) {
  assert.ok(database);
  mock.method(database, "query", async (sql: string) => {
    if (sql.includes(SESSION_SQL_LABEL)) return { rows: accountActive ? [ACTIVE_ACCOUNT_ROW] : [] };
    if (sql.includes(MEMBERSHIP_SQL_LABEL)) return membership ?? { rows: [MEMBERSHIP_ROW] };
    return { rows: [] };
  });
}

test("active maintainer can list every office without membership while regular user cannot", async () => {
  assert.ok(database);
  mock.method(database, "query", async (sql: string, values: unknown[]) => {
    assert.match(sql, /offices\.archived_at IS NULL/);
    assert.match(sql, /\$2::boolean OR offices\.owner_username = \$1 OR memberships\.username IS NOT NULL/);
    assert.deepEqual(values.slice(0, 1), [USERNAME]);
    return { rows: values[1] ? [{ id: OFFICE_ID, name: "Other office", owner_username: PEER_USERNAME, membership_role: null }] : [] };
  });
  try {
    assert.deepEqual(await listOffices(USERNAME, true), [{ id: OFFICE_ID, name: "Other office", ownerUsername: PEER_USERNAME, role: "maintainer" }]);
    assert.deepEqual(await listOffices(USERNAME), []);
  } finally { mock.restoreAll(); }
});

test("active maintainer joins unrelated office with authoritative maintainer state", async () => {
  const f = fixture();
  try {
    assert.ok(database);
    mock.method(database, "query", async (sql: string) => {
      if (sql.includes(SESSION_SQL_LABEL)) return { rows: [{ ...ACTIVE_ACCOUNT_ROW, is_maintainer: true, nickname: "Support" }] };
      if (sql.includes(MEMBERSHIP_SQL_LABEL)) return { rows: [{ owner_username: PEER_USERNAME, membership_role: null }] };
      return { rows: [] };
    });
    const auth = await f.room.onAuth(f.client, { officeId: OFFICE_ID }, authContext());
    assert.equal(auth.officeRole, "maintainer");
    f.room.onJoin(f.client, {}, auth);
    assert.equal(f.room.state.players.get(SESSION_ID)?.displayName, "Support");
    assert.equal(f.room.state.players.get(SESSION_ID)?.isMaintainer, true);
    f.room.onDrop(f.client, TRANSPORT_DROP_CLOSE_CODE);
    await f.room.onReconnect(f.client);
    assert.equal(f.room.state.players.get(SESSION_ID)?.presence, "online");
    assert.deepEqual(f.leaveCodes, []);
  } finally { f.cleanup(); }
});

test("regular office member cannot set maintainer state through join options", async () => {
  const f = fixture();
  try {
    assert.equal(new PlayerState().isMaintainer, false);
    queryBoundary();
    const auth = await f.room.onAuth(f.client, { officeId: OFFICE_ID }, authContext());
    f.room.onJoin(f.client, { isMaintainer: true, role: "maintainer" }, auth);
    assert.equal(f.room.state.players.get(SESSION_ID)?.isMaintainer, false);
  } finally { f.cleanup(); }
});

test("reconnect refreshes a former maintainer badge and office role from current session", async () => {
  const f = fixture();
  try {
    f.player.isMaintainer = true;
    f.internals.officeRolesBySessionId.set(SESSION_ID, "maintainer");
    queryBoundary();
    f.room.onDrop(f.client, TRANSPORT_DROP_CLOSE_CODE);
    await f.room.onReconnect(f.client);
    assert.equal(f.player.presence, "online");
    assert.equal(f.player.isMaintainer, false);
    assert.equal(f.internals.officeRolesBySessionId.get(SESSION_ID), "owner");
  } finally { f.cleanup(); }
});

test("regular nonmember cannot join by claiming maintainer role in options", async () => {
  const f = fixture();
  try {
    assert.ok(database);
    mock.method(database, "query", async (sql: string) => {
      if (sql.includes(SESSION_SQL_LABEL)) return { rows: [ACTIVE_ACCOUNT_ROW] };
      if (sql.includes(MEMBERSHIP_SQL_LABEL)) return { rows: [{ owner_username: PEER_USERNAME, membership_role: null }] };
      return { rows: [] };
    });
    const options = { officeId: OFFICE_ID, role: "maintainer", officeRole: "maintainer", isMaintainer: true };
    await assert.rejects(f.room.onAuth(f.client, options, authContext()), /invitation/);
  } finally { f.cleanup(); }
});

test("suspended maintainer cannot authenticate even with an office that exists", async () => {
  const f = fixture();
  let officeChecks = 0;
  try {
    assert.ok(database);
    mock.method(database, "query", async (sql: string) => {
      if (sql.includes(SESSION_SQL_LABEL)) {
        assert.match(sql, /users\.suspended_at IS NULL/);
        return { rows: [] };
      }
      if (sql.includes(MEMBERSHIP_SQL_LABEL)) officeChecks += 1;
      return { rows: [] };
    });
    await assert.rejects(f.room.onAuth(f.client, { officeId: OFFICE_ID }, authContext()), /Authentication required/);
    assert.equal(officeChecks, 0);
  } finally { f.cleanup(); }
});

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
  let membershipReadCount = 0;
  try {
    assert.ok(database);
    mock.method(database, "query", async (sql: string) => {
      if (sql.includes(SESSION_SQL_LABEL)) return { rows: [ACTIVE_ACCOUNT_ROW] };
      if (sql.includes(MEMBERSHIP_SQL_LABEL)) {
        membershipReadCount += 1;
        if (membershipReadCount === 1) { membershipStarted(); return membership; }
        return { rows: [MEMBERSHIP_ROW] };
      }
      return { rows: [] };
    });
    f.room.onDrop(f.client, TRANSPORT_DROP_CLOSE_CODE);
    const reconnect = f.room.onReconnect(f.client);
    await started;
    const replacement = { ...f.client, sessionId: REPLACEMENT_SESSION_ID } as Client;
    const context = authContext();
    const auth = await f.room.onAuth(replacement, { officeId: OFFICE_ID }, context);
    f.room.onJoin(replacement, {}, auth);
    const rotationsAfterReplacement = f.rotations();
    resolveMembership({ rows: [MEMBERSHIP_ROW] });
    await reconnect;
    assert.equal(f.player.presence, "away");
    assert.equal(f.internals.movementInputs.has(SESSION_ID), false);
    assert.equal(f.internals.sessionSecurity.activeSession(USERNAME), REPLACEMENT_SESSION_ID);
    assert.equal(f.room.state.players.get(REPLACEMENT_SESSION_ID)?.presence, "online");
    assert.equal(f.internals.movementInputs.has(REPLACEMENT_SESSION_ID), true);
    assert.equal(f.seatRejected(), true);
    assert.equal(f.rotations(), rotationsAfterReplacement);
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
    const context = authContext();
    const auth = await f.room.onAuth(f.client, { officeId: OFFICE_ID }, context);
    f.room.onJoin(f.client, {}, auth);
    assert.deepEqual(f.leaveCodes, [], "the joining session must not block its own spawn");
    assert.notEqual(f.room.state.players.get(SESSION_ID), f.player);
    assert.equal(f.internals.sessionSecurity.activeSession(USERNAME), SESSION_ID);
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

test("OfficeRoom disposal preserves shared spotlight until the last room closes", async () => {
  const first = fixture();
  const second = fixture();
  second.internals.spotlight = first.spotlight;
  registry.roomsByOffice.set(OFFICE_ID, new Set([first.room, second.room]));
  try {
    await first.spotlight.command(USERNAME, { targetUsername: USERNAME, on: true });
    const before = first.rotations();
    first.room.onDrop(first.client, TRANSPORT_DROP_CLOSE_CODE);
    first.room.onDispose();
    assert.equal(first.seatRejected(), true);
    assert.equal(first.rotations(), before);
    assert.deepEqual(first.spotlight.snapshot().usernames, [USERNAME]);
    second.room.onDrop(second.client, TRANSPORT_DROP_CLOSE_CODE);
    second.room.onDispose();
    assert.equal(second.seatRejected(), true);
    assert.equal(first.rotations() - before, 1);
    assert.deepEqual(first.spotlight.snapshot().usernames, []);
  } finally { first.cleanup(); second.cleanup(); }
});

async function deliberatelyRejectSeat(f: ReturnType<typeof fixture>, action: string) {
  if (action === KICK_REJECTION_LABEL) { OfficeRoom.kickMember(OFFICE_ID, USERNAME); return; }
  if (action === CLOSE_REJECTION_LABEL) { OfficeRoom.closeOffice(OFFICE_ID); return; }
  queryBoundary();
  const replacement = { ...f.client, sessionId: REPLACEMENT_SESSION_ID } as Client;
  const context = authContext();
  await f.room.onAuth(replacement, { officeId: OFFICE_ID }, context);
}

for (const action of [KICK_REJECTION_LABEL, CLOSE_REJECTION_LABEL, REPLACE_REJECTION_LABEL]) {
  test(`OfficeRoom ${action} seat rejection logs info and leaves error metric unchanged`, async () => {
    const f = fixture();
    const errors: string[] = [];
    const events: string[] = [];
    mock.method(console, "error", (message: string) => { errors.push(message); });
    mock.method(console, "info", (message: string) => { events.push(message); });
    try {
      const errorsBefore = getRecentServerErrorCount();
      f.room.onDrop(f.client, TRANSPORT_DROP_CLOSE_CODE);
      await deliberatelyRejectSeat(f, action);
      await Promise.resolve();
      assert.deepEqual(errors, []);
      assert.equal(getRecentServerErrorCount(), errorsBefore);
      const rejected = events.map(message => JSON.parse(message)).filter(event => event.event === RECONNECT_REJECTED_EVENT_LABEL);
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0].level, "info");
      assert.equal(f.seatRejected(), true);
    } finally { f.cleanup(); }
  });
}


test("OfficeRoom disposal removes a dropped presenter absent from live peer rooms", async () => {
  const first = fixture();
  const second = fixture();
  second.internals.spotlight = first.spotlight;
  second.internals.sessionSecurity.activate(PEER_USERNAME, SESSION_ID);
  // Finish Alice's peer session so only the disposing room owns her session.
  second.internals.sessionSecurity.finish(USERNAME, SESSION_ID);
  second.internals.usernamesBySessionId.set(SESSION_ID, PEER_USERNAME);
  registry.roomsByOffice.set(OFFICE_ID, new Set([first.room, second.room]));
  try {
    await first.spotlight.command(USERNAME, { targetUsername: USERNAME, on: true });
    await first.spotlight.command(USERNAME, { targetUsername: PEER_USERNAME, on: true });
    const before = first.rotations();
    first.room.onDrop(first.client, TRANSPORT_DROP_CLOSE_CODE);
    first.room.onDispose();
    assert.equal(first.seatRejected(), true);
    assert.equal(first.rotations() - before, 1);
    assert.deepEqual(first.spotlight.snapshot().usernames, [PEER_USERNAME]);
    first.room.onLeave(first.client, OFFICE_ACCESS_REVOKED_CLOSE_CODE);
    assert.equal(first.rotations() - before, 1);
    assert.deepEqual(first.spotlight.snapshot().usernames, [PEER_USERNAME]);
  } finally { first.cleanup(); second.cleanup(); }
});

test("OfficeRoom invalid capacity never registers the room", async () => {
  const room = new OfficeRoom();
  const previousCapacity = process.env.ROOM_MAX_CLIENTS;
  process.env.ROOM_MAX_CLIENTS = INVALID_ROOM_MAX_CLIENTS_LABEL;
  mock.method(room, "setMetadata", async () => {});
  queryBoundary();
  try {
    await assert.rejects(room.onCreate({ officeId: VALID_OFFICE_ID }), /ROOM_MAX_CLIENTS must be a positive integer/);
    assert.equal(registry.roomsByOffice.has(VALID_OFFICE_ID), false);
  } finally {
    if (previousCapacity === undefined) delete process.env.ROOM_MAX_CLIENTS;
    else process.env.ROOM_MAX_CLIENTS = previousCapacity;
    registry.roomsByOffice.delete(VALID_OFFICE_ID);
    room.clock.stop();
    mock.restoreAll();
  }
});


test("OfficeRoom disposal ignores revoked peer ownership of a dropped presenter", async () => {
  const first = fixture();
  const second = fixture();
  second.internals.spotlight = first.spotlight;
  registry.roomsByOffice.set(OFFICE_ID, new Set([first.room, second.room]));
  try {
    await first.spotlight.command(USERNAME, { targetUsername: USERNAME, on: true });
    const before = first.rotations();
    assert.equal(second.internals.sessionSecurity.revoke(SESSION_ID), true);
    assert.equal(second.internals.sessionSecurity.activeSession(USERNAME), SESSION_ID);
    first.room.onDrop(first.client, TRANSPORT_DROP_CLOSE_CODE);
    first.room.onDispose();
    assert.equal(first.seatRejected(), true);
    assert.equal(first.rotations() - before, 1);
    assert.deepEqual(first.spotlight.snapshot().usernames, []);
    first.room.onLeave(first.client, OFFICE_ACCESS_REVOKED_CLOSE_CODE);
    assert.equal(first.rotations() - before, 1);
  } finally { first.cleanup(); second.cleanup(); }
});

test("OfficeRoom graceful shutdown skips reconnect reservations", () => {
  const f = fixture();
  const disconnect = mock.method(f.room, "disconnect", () => Promise.resolve());
  const reconnect = mock.method(f.room, "allowReconnection", () => Promise.reject(new Error(ROOM_DISPOSING_MESSAGE_LABEL)));
  try {
    f.room.onBeforeShutdown();
    f.room.onDrop(f.client, SERVER_SHUTDOWN_CLOSE_CODE);
    assert.equal(disconnect.mock.callCount(), 1);
    assert.equal(reconnect.mock.callCount(), 0);
  } finally { f.cleanup(); }
});

test("OfficeRoom rejected plain reconnect promise is never reserved as a cancellable seat", async () => {
  const f = fixture();
  const errors: string[] = [];
  mock.method(console, "error", (message: string) => { errors.push(message); });
  mock.method(f.room, "allowReconnection", () => Promise.reject(new Error(ROOM_DISPOSING_MESSAGE_LABEL)));
  try {
    const errorsBefore = getRecentServerErrorCount();
    f.room.onDrop(f.client, TRANSPORT_DROP_CLOSE_CODE);
    assert.doesNotThrow(() => OfficeRoom.kickMember(OFFICE_ID, USERNAME));
    await Promise.resolve();
    assert.deepEqual(errors, []);
    assert.equal(getRecentServerErrorCount(), errorsBefore);
  } finally { f.cleanup(); }
});

test("OfficeRoom non-last disposal of pending-seat non-presenter keeps spotlight epoch", async () => {
  const first = fixture();
  const second = fixture();
  second.internals.spotlight = first.spotlight;
  second.internals.sessionSecurity.finish(USERNAME, SESSION_ID);
  second.internals.sessionSecurity.activate(PEER_USERNAME, SESSION_ID);
  second.internals.usernamesBySessionId.set(SESSION_ID, PEER_USERNAME);
  registry.roomsByOffice.set(OFFICE_ID, new Set([first.room, second.room]));
  try {
    await first.spotlight.command(USERNAME, { targetUsername: PEER_USERNAME, on: true });
    const before = first.spotlight.snapshot();
    first.room.onDrop(first.client, TRANSPORT_DROP_CLOSE_CODE);
    first.room.onDispose();
    assert.equal(first.seatRejected(), true);
    assert.deepEqual(first.spotlight.snapshot(), before);
  } finally { first.cleanup(); second.cleanup(); }
});


test("concurrent authentication replaces the session activated while availability was loading", async () => {
  const f = fixture();
  const pending: Array<() => void> = [];
  let bothLoading!: () => void;
  const loading = new Promise<void>(resolve => { bothLoading = resolve; });
  const internals = f.room as unknown as { availability: { load(): Promise<ReturnType<typeof defaultAvailability>> } };
  internals.availability = { load: () => new Promise(resolve => {
    pending.push(() => resolve(defaultAvailability()));
    if (pending.length === 2) bothLoading();
  }) };
  try {
    queryBoundary();
    const first = { ...f.client, sessionId: "first-concurrent" } as Client;
    const second = { ...f.client, sessionId: "second-concurrent" } as Client;
    const firstAuth = f.room.onAuth(first, { officeId: OFFICE_ID }, authContext());
    const secondAuth = f.room.onAuth(second, { officeId: OFFICE_ID }, authContext());
    await loading;
    pending[0]!();
    f.room.onJoin(first, {}, await firstAuth);
    pending[1]!();
    f.room.onJoin(second, {}, await secondAuth);
    assert.equal(f.room.state.players.has(first.sessionId), false);
    assert.equal(f.room.state.players.has(second.sessionId), true);
    assert.equal(f.internals.sessionSecurity.activeSession(USERNAME), second.sessionId);
  } finally { f.cleanup(); }
});
