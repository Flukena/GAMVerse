import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { DeskRepository } from "./deskRepository.js";
const OFFICE_ID = "00000000-0000-4000-8000-000000000001";
const DESK_ID = "00000000-0000-4000-8000-000000000002";
const USERNAME = "alice";
class DeskStorage {
  readonly calls: string[] = [];
  member = true;
  owner: string | null = null;
  version = 1;
  released = false;
  config: unknown = { version: 1, layout: { zones: [{ id: "desk", kind: "private", name: "Desk", x: 2, z: 3, width: 4, depth: 4, color: "#ffffff" }] } };
  async query(sql: string, values: unknown[] = []) {
    this.calls.push(sql);
    if (sql.includes("SELECT 1 FROM app_offices")) return { rows: this.member ? [{}] : [], rowCount: this.member ? 1 : 0 };
    if (sql.startsWith("SELECT config")) return { rows: [{ config: this.config, config_version: this.version }] };
    if (sql.startsWith("SELECT id,")) return { rows: [{ id: DESK_ID, office_id: OFFICE_ID, zone_id: "desk", owner_username: this.owner }] };
    if (sql.startsWith("UPDATE app_office_desks")) this.owner = values[2] as string | null;
    if (sql.startsWith("UPDATE app_office_map_layouts")) {
      this.config = JSON.parse(String(values[1])) as unknown;
      this.version += 1;
      return { rows: [{ config: this.config, config_version: this.version }] };
    }
    return { rows: [] };
  }
  repository() {
    const query = this.query.bind(this);
    return new DeskRepository({ connect: async () => ({ query, release: () => { this.released = true; } }) } as unknown as Pool);
  }
}
test("claim checks membership after map lock and rejects outsider without changing ownership", async () => {
  const store = new DeskStorage(); store.member = false;
  await assert.rejects(store.repository().change(USERNAME, OFFICE_ID, { deskId: DESK_ID }, true), /access denied/);
  assert.equal(store.owner, null);
  assert.equal(store.calls.some(sql => sql.startsWith("UPDATE")), false);
  assert.ok(store.calls.findIndex(sql => sql.includes("FOR UPDATE")) < store.calls.findIndex(sql => sql.includes("SELECT 1 FROM app_offices")));
  assert.ok(store.calls.includes("ROLLBACK"));
  assert.equal(store.released, true);
});
test("claim persists canonical owner and map revision; repeated claim is idempotent", async () => {
  const store = new DeskStorage();
  const first = await store.repository().change(USERNAME, OFFICE_ID, { deskId: DESK_ID }, true);
  assert.equal(first.desks[0]?.ownerUsername, USERNAME);
  assert.equal(first.configVersion, 2);
  const repeated = await store.repository().change(USERNAME, OFFICE_ID, { deskId: DESK_ID }, true);
  assert.equal(repeated.configVersion, first.configVersion);
});
test("another member cannot steal or release an owned desk", async () => {
  const store = new DeskStorage(); store.owner = "bob";
  await assert.rejects(store.repository().change(USERNAME, OFFICE_ID, { deskId: DESK_ID }, true), /already been claimed/);
  await assert.rejects(store.repository().change(USERNAME, OFFICE_ID, { deskId: DESK_ID }, false), /Only the desk owner/);
  assert.equal(store.owner, "bob");
  assert.equal(store.calls.some(sql => sql.startsWith("UPDATE")), false);
});
test("return lookup checks current membership and requires current desk owner", async () => {
  const store = new DeskStorage();
  await assert.rejects(store.repository().destination(USERNAME, OFFICE_ID, DESK_ID), /Claim this desk/);
  store.owner = USERNAME;
  const result = await store.repository().destination(USERNAME, OFFICE_ID, DESK_ID);
  assert.equal(result.zone.x, 2); assert.equal(result.zone.z, 3);
  store.member = false;
  await assert.rejects(store.repository().destination(USERNAME, OFFICE_ID, DESK_ID), /access denied/);
});
