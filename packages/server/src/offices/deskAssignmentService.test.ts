import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import type { DeskAssignmentFence, OfficeDeskAssignmentCommand } from "@gammyverse/shared";
import { DeskAssignmentService } from "./deskAssignmentService.js";
import { DeskAssignmentFences } from "./deskAssignmentFences.js";

const OFFICE_ID = "00000000-0000-4000-8000-000000000001";
const SOURCE_ID = "00000000-0000-4000-8000-000000000002";
const TARGET_ID = "00000000-0000-4000-8000-000000000003";
const REQUEST_ID = "00000000-0000-4000-8000-000000000004";
const ACTOR = { username: "admin", sessionToken: "test-session" };
const NOW_MS = 100_000;

class AssignmentStorage {
  calls: string[] = [];
  writes: (string | null)[] = [];
  version = 1;
  owners: (string | null)[] = [null, null];
  admin = true;
  maintainer = false;
  active = true;
  sessionActive = true;
  targetMember = true;
  targetSuspended = false;
  failSecondWrite = false;
  failCommit = false;
  inTransaction = false;
  released = false;
  private saved = { owners: this.owners.slice(), version: this.version };
  config: unknown = { version: 1, layout: { zones: [
    { id: "source", name: "Garden Desk", kind: "private", x: 0, z: 0, width: 4, depth: 4, color: "#ffffff" },
    { id: "target", name: "Window Desk", kind: "private", x: 6, z: 0, width: 4, depth: 4, color: "#ffffff" },
  ] } };

  async query(sql: string, values: unknown[] = []) {
    this.calls.push(sql);
    if (sql === "BEGIN") { this.saved = { owners: this.owners.slice(), version: this.version }; this.inTransaction = true; }
    if (sql === "ROLLBACK") { this.owners = this.saved.owners; this.version = this.saved.version; this.inTransaction = false; }
    if (sql === "COMMIT") { this.inTransaction = false; if (this.failCommit) throw new Error("connection lost during COMMIT"); }
    if (sql.startsWith("SELECT config,")) return { rows: [{ config: this.config, config_version: this.version }] };
    if (sql.startsWith("SELECT username, role")) return { rows: [{ username: "admin", role: this.admin ? "admin" : "user" }, ...(this.targetMember ? [{ username: "bob", role: "user" }] : [])] };
    if (sql.startsWith("SELECT username, nickname")) return { rows: [
      { username: "admin", nickname: null, is_maintainer: this.maintainer, suspended_at: this.active ? null : new Date() },
      { username: "owner", nickname: "Office Owner", is_maintainer: false, suspended_at: null },
      { username: "bob", nickname: "Bobby", is_maintainer: false, suspended_at: this.targetSuspended ? new Date() : null },
    ] };
    if (sql.startsWith("SELECT 1 FROM app_sessions")) return { rows: [], rowCount: this.sessionActive ? 1 : 0 };
    if (sql.startsWith("SELECT owner_username")) return { rows: [{ owner_username: "owner" }] };
    if (sql.startsWith("SELECT id,")) return { rows: [SOURCE_ID, TARGET_ID].map((id, index) => ({ id, office_id: OFFICE_ID, zone_id: index ? "target" : "source", owner_username: this.owners[index] })) };
    if (sql.startsWith("UPDATE app_office_desks")) {
      const index = values[1] === SOURCE_ID ? 0 : 1;
      if (this.owners[index] !== values[3] || (this.failSecondWrite && this.writes.length === 1)) return { rows: [], rowCount: 0 };
      const owner = values[2] as string | null;
      if (owner && this.owners.some((entry, other) => entry === owner && other !== index)) throw new Error("unique owner constraint");
      this.owners[index] = owner;
      this.writes.push(owner);
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE app_office_map_layouts")) {
      this.version += 1;
      this.config = JSON.parse(String(values[1]));
      return { rows: [{ config: this.config, config_version: this.version }] };
    }
    return { rows: [], rowCount: 0 };
  }
  pool() { return { connect: async () => ({ query: this.query.bind(this), release: () => { this.released = true; } }) } as unknown as Pool; }
}

function fixture() {
  const storage = new AssignmentStorage();
  const registry = new DeskAssignmentFences(() => NOW_MS);
  const events: string[] = [];
  let failPrepare = false;
  let failRefresh = false;
  const realtime = {
    status: async (id: string) => { assert.equal(storage.inTransaction, true); return { operation: registry.current(id) ?? null, appliedConfigVersion: storage.version }; },
    recover: async (fence: DeskAssignmentFence) => { assert.equal(storage.inTransaction, true); events.push("recover"); registry.rollback(fence); },
    prepare: async (fence: DeskAssignmentFence) => {
      assert.equal(storage.inTransaction, true);
      events.push("prepare"); registry.prepare(fence);
      if (failPrepare) throw new Error("fence unavailable");
    },
    rollback: async (fence: DeskAssignmentFence) => { assert.equal(storage.inTransaction, false); events.push("rollback-fence"); registry.rollback(fence); },
    refresh: async (id: string) => { assert.equal(storage.inTransaction, false); events.push("refresh"); if (failRefresh) throw new Error("refresh unavailable"); registry.applied(id, storage.version); },
  };
  const service = new DeskAssignmentService(realtime, storage.pool(), () => NOW_MS);
  const assign: OfficeDeskAssignmentCommand = { requestId: REQUEST_ID, expectedConfigVersion: 1, action: "assign", deskId: TARGET_ID, expectedOwnerUsername: null, ownerUsername: "bob" };
  return { storage, registry, events, realtime, service, assign, failPrepare: () => { failPrepare = true; }, failRefresh: (value: boolean) => { failRefresh = value; } };
}

test("fresh admin, active account and session are checked after map lock before any assignment or fence", async () => {
  for (const deny of ["admin", "active", "sessionActive"] as const) {
    const f = fixture(); f.storage[deny] = false;
    await assert.rejects(f.service.change(OFFICE_ID, ACTOR, f.assign), /access was denied/);
    assert.deepEqual(f.storage.owners, [null, null]);
    assert.deepEqual(f.events, []);
    assert.equal(f.storage.released, true);
    assert.ok(f.storage.calls.includes("ROLLBACK"));
  }
  const f = fixture(); f.storage.admin = false; f.storage.maintainer = true;
  assert.equal((await f.service.change(OFFICE_ID, ACTOR, f.assign)).persisted, true);
  assert.ok(f.storage.calls.findIndex(sql => sql.includes("FOR UPDATE")) < f.storage.calls.findIndex(sql => sql.includes("FROM app_sessions")));
});

test("target must remain an unsuspended current office member and version/owner CAS never displaces", async () => {
  for (const unavailable of ["targetMember", "targetSuspended"] as const) {
    const f = fixture(); f.storage[unavailable] = unavailable === "targetSuspended";
    await assert.rejects(f.service.change(OFFICE_ID, ACTOR, f.assign), /no longer eligible/);
    assert.deepEqual(f.events, []);
  }
  const f = fixture();
  await assert.rejects(f.service.change(OFFICE_ID, ACTOR, { ...f.assign, expectedConfigVersion: 2 }), /changed/);
  f.storage.owners[1] = "owner";
  await assert.rejects(f.service.change(OFFICE_ID, ACTOR, f.assign), /changed/);
  assert.deepEqual(f.storage.owners, [null, "owner"]);
});

test("atomic move clears unique source before empty target, increments map once and notifies after commit", async () => {
  const f = fixture(); f.storage.owners[0] = "bob";
  const command: OfficeDeskAssignmentCommand = { requestId: REQUEST_ID, expectedConfigVersion: 1, action: "move", sourceDeskId: SOURCE_ID, targetDeskId: TARGET_ID, expectedSourceOwnerUsername: "bob", expectedTargetOwnerUsername: null };
  const result = await f.service.change(OFFICE_ID, ACTOR, command);
  assert.deepEqual(f.storage.writes, [null, "bob"]);
  assert.deepEqual(f.storage.owners, [null, "bob"]);
  assert.equal(result.configVersion, 2);
  assert.equal(result.realtimeSync, "applied");
  assert.deepEqual(f.events, ["prepare", "refresh"]);
  assert.equal(f.registry.current(OFFICE_ID), undefined);
});

test("failed second move write rolls back source and releases only its confirmed rollback fence", async () => {
  const f = fixture(); f.storage.owners[0] = "bob"; f.storage.failSecondWrite = true;
  await assert.rejects(f.service.change(OFFICE_ID, ACTOR, { requestId: REQUEST_ID, expectedConfigVersion: 1, action: "move", sourceDeskId: SOURCE_ID, targetDeskId: TARGET_ID, expectedSourceOwnerUsername: "bob", expectedTargetOwnerUsername: null }), /changed/);
  assert.deepEqual(f.storage.owners, ["bob", null]);
  assert.equal(f.storage.version, 1);
  assert.deepEqual(f.events, ["prepare", "rollback-fence"]);
  assert.equal(f.registry.current(OFFICE_ID), undefined);
});

test("precommit fence failure prevents ownership change; postcommit refresh failure is persisted pending and GET recovers", async () => {
  const before = fixture(); before.failPrepare();
  await assert.rejects(before.service.change(OFFICE_ID, ACTOR, before.assign), /fence unavailable/);
  assert.deepEqual(before.storage.owners, [null, null]);
  assert.equal(before.registry.current(OFFICE_ID), undefined);
  const after = fixture(); after.failRefresh(true);
  const saved = await after.service.change(OFFICE_ID, ACTOR, after.assign);
  assert.equal(saved.persisted, true);
  assert.equal(saved.realtimeSync, "pending");
  assert.equal(after.storage.owners[1], "bob");
  assert.ok(after.registry.current(OFFICE_ID));
  after.failRefresh(false);
  const current = await after.service.list(OFFICE_ID, ACTOR);
  assert.equal(current.configVersion, 2);
  assert.equal(current.realtimeSync, "applied");
  assert.equal(current.desks[1]?.name, "Window Desk");
  assert.equal(after.registry.current(OFFICE_ID), undefined);
});

test("unknown COMMIT never claims rollback and retains fence until locked canonical recovery", async () => {
  const f = fixture(); f.storage.failCommit = true;
  await assert.rejects(f.service.change(OFFICE_ID, ACTOR, f.assign), /outcome is being checked/);
  assert.equal(f.storage.calls.includes("ROLLBACK"), false);
  assert.ok(f.registry.current(OFFICE_ID));
  assert.equal(f.events.includes("rollback-fence"), false);
  f.storage.failCommit = false;
  await f.service.list(OFFICE_ID, ACTOR);
  assert.equal(f.registry.current(OFFICE_ID), undefined);
});

test("opening desk administration without a pending fence preserves another user's actual room desk route", async () => {
  const { OfficeRoom } = await import("./OfficeRoom.js");
  const f = fixture();
  const room = new OfficeRoom();
  const internals = room as unknown as { autoRoutes: Map<string, unknown>; applyMapConfig(config: unknown, version: number): void };
  internals.autoRoutes.set("traveller", { deskZoneId: "source", points: [{ x: 0, z: 0 }], index: 0, stalledTicks: 0 });
  f.realtime.refresh = async () => { internals.applyMapConfig(f.storage.config, f.storage.version); };
  try {
    await f.service.list(OFFICE_ID, ACTOR);
    assert.equal(internals.autoRoutes.has("traveller"), true);
  } finally { room.clock.stop(); }
});
