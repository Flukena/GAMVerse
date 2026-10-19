import assert from "node:assert/strict";
import test from "node:test";
import { isOfficeDeskAssignmentCommand, type OfficeDeskAdministrationSnapshot, type OfficeDeskAssignmentCommand, type OfficeDeskAssignmentResult } from "@gammyverse/shared";
import { DeskManagerController, type DeskManagerContext } from "./deskManager";
import type { DeskFetch } from "./officeDesks";

const OFFICE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_OFFICE_ID = "55555555-5555-4555-8555-555555555555";
const DESK_ID = "22222222-2222-4222-8222-222222222222";
const HTTP_OK_STATUS = 200;
const HTTP_FORBIDDEN_STATUS = 403;
const HTTP_CONFLICT_STATUS = 409;
const CONTEXT: DeskManagerContext = { endpoint: "https://office.test", officeId: OFFICE_ID, username: "admin", sessionKey: "session", configVersion: 1 };
const SNAPSHOT: OfficeDeskAdministrationSnapshot = { officeId: OFFICE_ID, configVersion: 1, realtimeSync: "applied", desks: [{ id: DESK_ID, officeId: OFFICE_ID, zoneId: "desk-zone", name: "Design desk", ownerUsername: null }], members: [{ username: "offline.member", displayName: "Offline Member" }] };
const ASSIGN = { action: "assign", deskId: DESK_ID, ownerUsername: "offline.member" } as const;
function response(payload: unknown, status = HTTP_OK_STATUS): Response { return new Response(JSON.stringify(payload), { status }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function result(command: OfficeDeskAssignmentCommand, realtimeSync: "applied" | "pending" = "applied"): OfficeDeskAssignmentResult {
  return { desks: SNAPSHOT.desks.map(desk => ({ ...desk, ownerUsername: "offline.member" })), configVersion: 2, config: {}, requestId: command.requestId, persisted: true, realtimeSync };
}
async function loaded(fetcher: DeskFetch) { const controller = new DeskManagerController(fetcher); controller.configure(CONTEXT); await controller.refresh(); return controller; }
test("offline-member assignment sends exact CAS fields and waits for authoritative persistence", async () => {
  const post = deferred<Response>();
  const commands: OfficeDeskAssignmentCommand[] = [];
  const controller = await loaded(async (url, init) => {
    assert.ok(url.endsWith(`/offices/${OFFICE_ID}/desks/assignments`));
    if (init.method === "GET") return response(SNAPSHOT);
    commands.push(JSON.parse(String(init.body)) as OfficeDeskAssignmentCommand);
    return post.promise;
  });
  const saving = controller.submit(ASSIGN);
  const command = commands[0];
  assert.equal(controller.snapshot.snapshot?.desks[0]?.ownerUsername, null);
  assert.equal(controller.snapshot.pendingDeskId, DESK_ID);
  assert.ok(isOfficeDeskAssignmentCommand(command));
  assert.equal(command.expectedConfigVersion, 1);
  post.resolve(response(result(command)));
  assert.equal((await saving)?.persisted, true);
  assert.equal(controller.snapshot.snapshot?.desks[0]?.ownerUsername, "offline.member");
  assert.equal(controller.snapshot.snapshot?.desks[0]?.name, "Design desk");
  assert.equal(controller.snapshot.saved?.realtimeSync, "applied");
});
test("conflicts preserve canonical owners and require an explicit successful reload before retry", async () => {
  let calls = 0;
  const controller = await loaded(async (_url, init) => {
    calls++;
    return init.method === "GET" ? response(SNAPSHOT) : response({ code: "conflict", error: "The desk owner changed." }, HTTP_CONFLICT_STATUS);
  });
  assert.equal(await controller.submit(ASSIGN), null);
  assert.equal(controller.snapshot.snapshot?.desks[0]?.ownerUsername, null);
  assert.equal(controller.snapshot.needsReload, true);
  assert.equal(await controller.submit(ASSIGN), null);
  assert.equal(calls, 2);
  await controller.refresh();
  assert.equal(controller.snapshot.needsReload, false);
});
test("a stale office request cannot populate the next office or publish a late failure", async () => {
  const old = deferred<Response>();
  const controller = new DeskManagerController(async (_url, init) => init.signal?.aborted ? response({}, HTTP_FORBIDDEN_STATUS) : old.promise);
  controller.configure(CONTEXT);
  const loading = controller.refresh();
  controller.configure({ ...CONTEXT, officeId: OTHER_OFFICE_ID, sessionKey: "other-session" });
  old.resolve(response(SNAPSHOT));
  await loading;
  assert.equal(controller.snapshot.snapshot, null);
  assert.equal(controller.snapshot.error, null);
});
test("a denied privileged reload clears the old member list and desk snapshot", async () => {
  let denied = false;
  const controller = await loaded(async () => denied ? response({ error: "Office admin access is required." }, HTTP_FORBIDDEN_STATUS) : response(SNAPSHOT));
  denied = true;
  await controller.refresh();
  assert.equal(controller.snapshot.snapshot, null);
  assert.match(controller.snapshot.error ?? "", /admin/);
  assert.equal(controller.snapshot.needsReload, true);
});
test("pending realtime synchronization is saved and a versioned event settles it before or after the POST response", async () => {
  for (const eventBeforeResult of [true, false]) {
    const post = deferred<Response>();
    const commands: OfficeDeskAssignmentCommand[] = [];
    const controller = await loaded(async (_url, init) => {
      if (init.method === "GET") return response(SNAPSHOT);
      commands.push(JSON.parse(String(init.body)) as OfficeDeskAssignmentCommand);
      return post.promise;
    });
    const saving = controller.submit(ASSIGN);
  const command = commands[0];
    assert.ok(command);
    if (eventBeforeResult) controller.confirmRealtime({ officeId: OFFICE_ID, configVersion: 2 }, CONTEXT);
    post.resolve(response(result(command, "pending")));
    assert.equal((await saving)?.persisted, true);
    if (!eventBeforeResult) {
      assert.equal(controller.snapshot.saved?.realtimeSync, "pending");
      controller.confirmRealtime({ officeId: OTHER_OFFICE_ID, configVersion: 2 }, CONTEXT);
      assert.equal(controller.snapshot.saved?.realtimeSync, "pending");
      controller.confirmRealtime({ officeId: OFFICE_ID, configVersion: 2 }, CONTEXT);
    }
    assert.equal(controller.snapshot.saved?.realtimeSync, "applied");
    assert.equal(controller.snapshot.needsReload, false);
  }
});
test("an acknowledged persistence result never becomes an apparent rollback when a newer map version is already known", async () => {
  const post = deferred<Response>();
  const commands: OfficeDeskAssignmentCommand[] = [];
  const controller = await loaded(async (_url, init) => {
    if (init.method === "GET") return response(SNAPSHOT);
    commands.push(JSON.parse(String(init.body)) as OfficeDeskAssignmentCommand);
    return post.promise;
  });
  const saving = controller.submit(ASSIGN);
  const command = commands[0];
  controller.configure({ ...CONTEXT, configVersion: 3 });
  assert.ok(command);
  post.resolve(response(result(command)));
  assert.equal((await saving)?.persisted, true);
  assert.ok(controller.snapshot.saved);
  assert.equal(controller.snapshot.needsReload, true);
  assert.equal(controller.snapshot.snapshot?.configVersion, 1);
});
test("disposing an in-flight assignment suppresses its late result", async () => {
  const post = deferred<Response>();
  const commands: OfficeDeskAssignmentCommand[] = [];
  const controller = await loaded(async (_url, init) => {
    if (init.method === "GET") return response(SNAPSHOT);
    commands.push(JSON.parse(String(init.body)) as OfficeDeskAssignmentCommand);
    return post.promise;
  });
  const saving = controller.submit(ASSIGN);
  const command = commands[0];
  controller.dispose();
  assert.ok(command);
  post.resolve(response(result(command)));
  assert.equal(await saving, null);
  assert.equal(controller.snapshot.saved, null);
});

test("reloading a saved assignment keeps actions blocked until its live application is confirmed", async () => {
  let saved = false;
  const controller = await loaded(async (_url, init) => {
    if (init.method === "GET") return response(saved ? { ...SNAPSHOT, realtimeSync: "pending", configVersion: 2, desks: SNAPSHOT.desks.map(desk => ({ ...desk, ownerUsername: "offline.member" })) } : SNAPSHOT);
    saved = true;
    return response(result(JSON.parse(String(init.body)) as OfficeDeskAssignmentCommand, "pending"));
  });
  assert.equal((await controller.submit(ASSIGN))?.persisted, true);
  await controller.refresh();
  assert.equal(controller.snapshot.saved?.realtimeSync, "pending");
  assert.equal(controller.snapshot.needsReload, true);
  controller.confirmRealtime({ officeId: OFFICE_ID, configVersion: 2 }, CONTEXT);
  assert.equal(controller.snapshot.needsReload, false);
});

test("a non-owner admin can recover a saved pending assignment through an authoritative applied GET", async () => {
  let saved = false;
  const controller = await loaded(async (_url, init) => {
    if (init.method === "GET") return response(saved ? { ...SNAPSHOT, configVersion: 2, realtimeSync: "applied", desks: SNAPSHOT.desks.map(desk => ({ ...desk, ownerUsername: "offline.member" })) } : SNAPSHOT);
    saved = true;
    return response(result(JSON.parse(String(init.body)) as OfficeDeskAssignmentCommand, "pending"));
  });
  assert.equal((await controller.submit(ASSIGN))?.persisted, true);
  assert.equal(controller.snapshot.saved?.realtimeSync, "pending");
  assert.ok(controller.snapshot.snapshot?.desks.every(desk => desk.ownerUsername !== CONTEXT.username));
  await controller.refresh();
  assert.equal(controller.snapshot.saved?.realtimeSync, "applied");
  assert.equal(controller.snapshot.needsReload, false);
});

test("a pending privileged GET blocks a fresh admin session even without a previous local mutation", async () => {
  const controller = await loaded(async () => response({ ...SNAPSHOT, realtimeSync: "pending" }));
  assert.equal(controller.snapshot.needsReload, true);
  assert.equal(await controller.submit(ASSIGN), null);
});

test("an applied GET older than the saved assignment version cannot clear pending recovery", async () => {
  const controller = await loaded(async (_url, init) => init.method === "GET" ? response(SNAPSHOT)
    : response(result(JSON.parse(String(init.body)) as OfficeDeskAssignmentCommand, "pending")));
  await controller.submit(ASSIGN);
  await controller.refresh();
  assert.equal(controller.snapshot.saved?.realtimeSync, "pending");
  assert.equal(controller.snapshot.needsReload, true);
  assert.equal(controller.snapshot.snapshot?.configVersion, 2);
});
