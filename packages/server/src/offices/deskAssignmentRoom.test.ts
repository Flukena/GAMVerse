import assert from "node:assert/strict";
import test, { after, mock } from "node:test";
import { DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS } from "@gammyverse/shared";

// Only the injected SQL boundary is used; this process has no database credentials.
process.env.PGDATABASE = "desk-assignment-room-test";
const { database } = await import("../infra/db.js");
const { OfficeRoom } = await import("./OfficeRoom.js");
const { deskAssignmentFences } = await import("./deskAssignmentFences.js");
const OFFICE_ID = "00000000-0000-4000-8000-000000000011";
const OPERATION_ID = "00000000-0000-4000-8000-000000000012";
const DESK_ID = "00000000-0000-4000-8000-000000000013";
const zone = { id: "desk", kind: "private", name: "Window Desk", x: 0, z: 0, width: 4, depth: 4, color: "#ffffff" };
const config = { version: 1, layout: { zones: [zone] } };
after(async () => { await database?.end(); });

test("room registering after assignment commit and empty-room refresh must read canonical owner again before accepting players", async () => {
  assert.ok(database);
  const room = new OfficeRoom();
  mock.method(room, "setMetadata", async () => {});
  mock.method(room, "setFixedTimestep", () => {});
  let version = 1;
  let owner = "alice";
  let firstOwnerRead = true;
  let readStarted!: () => void;
  let resolveOldOwners!: (value: unknown) => void;
  const started = new Promise<void>(resolve => { readStarted = resolve; });
  mock.method(database, "query", async (sql: string) => {
    if (sql.includes("SELECT maps.config")) return { rows: [{ config, config_version: version, office_props: null }] };
    if (sql.startsWith("SELECT id,")) {
      if (firstOwnerRead) {
        firstOwnerRead = false;
        readStarted();
        return new Promise(resolve => { resolveOldOwners = resolve; });
      }
      return { rows: [{ id: DESK_ID, office_id: OFFICE_ID, zone_id: zone.id, owner_username: owner }] };
    }
    return { rows: [] };
  });
  try {
    const creating = room.onCreate({ officeId: OFFICE_ID });
    await started;
    deskAssignmentFences.prepare({ officeId: OFFICE_ID, operationId: OPERATION_ID, expectedConfigVersion: 1, newConfigVersion: 2, zoneIds: [zone.id], deadlineAtMs: Date.now() + DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS });
    version = 2;
    owner = "bob";
    await OfficeRoom.updateMap(OFFICE_ID);
    assert.equal(deskAssignmentFences.current(OFFICE_ID), undefined);
    resolveOldOwners({ rows: [{ id: DESK_ID, office_id: OFFICE_ID, zone_id: zone.id, owner_username: "alice" }] });
    await creating;
    const internals = room as unknown as { mapConfigVersion: number; mapLayout: { zones: { ownerUsername: string }[] } };
    assert.equal(internals.mapConfigVersion, 2);
    assert.equal(internals.mapLayout.zones[0]?.ownerUsername, "bob");
  } finally {
    room.onDispose();
    room.clock.stop();
    mock.restoreAll();
  }
});

test("assignment notices target previous and current owners only and follow canonical map application", () => {
  const room = new OfficeRoom();
  const events: { target: string; event: string; payload: unknown }[] = [];
  const internals = room as unknown as {
    officeId: string; mapLayout: unknown; usernamesBySessionId: Map<string, string>;
    applyMapConfig(config: unknown, version: number): void;
  };
  internals.officeId = OFFICE_ID;
  internals.mapLayout = { version: 1, props: [], walls: [], doors: [], zones: [{ ...zone, ownerUsername: "alice" }] };
  for (const username of ["alice", "bob", "unrelated"]) {
    internals.usernamesBySessionId.set(username, username);
    room.clients.push({ sessionId: username, send: (event: string, payload: unknown) => events.push({ target: username, event, payload }) } as never);
  }
  mock.method(room, "broadcast", (event: string, payload: unknown) => { events.push({ target: "room", event, payload }); });
  try {
    internals.applyMapConfig({ version: 1, layout: { ...internals.mapLayout as object, zones: [{ ...zone, ownerUsername: "bob" }] } }, 2);
    const notices = events.filter(event => event.event === "office-desks-changed");
    assert.deepEqual(notices.map(event => event.target), ["alice", "bob"]);
    assert.ok(events.findIndex(event => event.event === "office-map") < events.findIndex(event => event.event === "office-desks-changed"));
    assert.deepEqual(notices[0]?.payload, { officeId: OFFICE_ID, configVersion: 2 });
  } finally { room.clock.stop(); mock.restoreAll(); }
});
