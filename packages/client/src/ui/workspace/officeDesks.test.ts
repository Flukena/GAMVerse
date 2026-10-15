import assert from "node:assert/strict";
import { test } from "node:test";
import { OfficeDesksController, type DeskFetch } from "./officeDesks";

const OFFICE_ID = "11111111-1111-1111-1111-111111111111";
const DESK_ID = "22222222-2222-2222-2222-222222222222";
const context = { endpoint: "https://api.example", officeId: OFFICE_ID, username: "alice", sessionKey: "session-a", configVersion: 1 };
const desk = { id: DESK_ID, officeId: OFFICE_ID, zoneId: "desk-a", ownerUsername: null as string | null };
const snapshot = (configVersion: number, ownerUsername: string | null = null) => ({ desks: [{ ...desk, ownerUsername }], configVersion });
function deferredFetch() {
  const requests: { url: string; init: RequestInit; resolve: (response: Response) => void }[] = [];
  const fetcher: DeskFetch = (url, init) => new Promise<Response>(resolve => requests.push({ url, init, resolve }));
  const respond = (index: number, body: unknown, status = 200) => requests[index]!.resolve(new Response(JSON.stringify(body), { status }));
  return { requests, fetcher, respond };
}

test("late office and reconnect responses cannot repopulate descriptors", async () => {
  const fake = deferredFetch();
  const store = new OfficeDesksController(fake.fetcher);
  store.configure(context);
  const old = store.refresh();
  store.configure({ ...context, sessionKey: "session-b" });
  fake.respond(0, snapshot(1, "alice"));
  await old;
  assert.deepEqual(store.snapshot.desks, []);
  assert.equal(store.snapshot.error, null);
});

test("reversed refresh responses cannot roll back map version or ownership", async () => {
  const fake = deferredFetch();
  const store = new OfficeDesksController(fake.fetcher);
  store.configure(context);
  const first = store.refresh();
  const second = store.refresh();
  fake.respond(1, snapshot(3, "alice"));
  await second;
  fake.respond(0, snapshot(2));
  await first;
  assert.equal(store.snapshot.configVersion, 3);
  assert.equal(store.snapshot.desks[0]?.ownerUsername, "alice");
  assert.equal(fake.requests[0]?.init.credentials, "include");
});

test("claim uses stable ID and returns authoritative config without retaining map", async () => {
  const fake = deferredFetch();
  const store = new OfficeDesksController(fake.fetcher);
  store.configure(context);
  const refresh = store.refresh();
  fake.respond(0, snapshot(1));
  await refresh;
  const operation = store.claim(DESK_ID);
  assert.equal(await store.claim(DESK_ID), null);
  assert.equal(store.snapshot.pendingDeskId, DESK_ID);
  const result = { ...snapshot(2, "alice"), config: { version: 1, layout: { zones: [] } } };
  fake.respond(1, result);
  assert.deepEqual(await operation, result);
  assert.equal(fake.requests[1]?.url, `${context.endpoint}/offices/${OFFICE_ID}/desks/${DESK_ID}/claim`);
  assert.equal(fake.requests[1]?.init.method, "POST");
  assert.equal(store.snapshot.pendingDeskId, null);
  assert.equal("config" in store.snapshot, false);
});

test("newer map version invalidates an in-flight mutation result", async () => {
  const fake = deferredFetch();
  const store = new OfficeDesksController(fake.fetcher);
  store.configure(context);
  const refresh = store.refresh();
  fake.respond(0, snapshot(1));
  await refresh;
  const operation = store.claim(DESK_ID);
  store.configure({ ...context, configVersion: 4 });
  fake.respond(1, { ...snapshot(2, "alice"), config: { version: 1, layout: {} } });
  assert.equal(await operation, null);
  assert.deepEqual(store.snapshot.desks, []);
  assert.equal(store.snapshot.pendingDeskId, null);
});

test("malformed, foreign-office and removed desk responses stay visible as errors", async () => {
  const fake = deferredFetch();
  const store = new OfficeDesksController(fake.fetcher);
  store.configure(context);
  const refresh = store.refresh();
  fake.respond(0, { ...snapshot(1), desks: [{ ...desk, officeId: "different-office" }] });
  await refresh;
  assert.match(store.snapshot.error ?? "", /invalid/i);
  assert.deepEqual(store.snapshot.desks, []);
  assert.equal(await store.claim(DESK_ID), null);
  assert.match(store.snapshot.error ?? "", /no longer exists/i);
  const retry = store.refresh();
  fake.respond(1, { desks: "broken", configVersion: 2 });
  await retry;
  assert.match(store.snapshot.error ?? "", /invalid/i);
});

test("server claim error releases busy state and next refresh recovers", async () => {
  const fake = deferredFetch();
  const store = new OfficeDesksController(fake.fetcher);
  store.configure(context);
  const initial = store.refresh();
  fake.respond(0, snapshot(1));
  await initial;
  const operation = store.claim(DESK_ID);
  fake.respond(1, { error: "This desk has already been claimed." }, 409);
  assert.equal(await operation, null);
  assert.match(store.snapshot.error ?? "", /already been claimed/);
  assert.equal(store.snapshot.pendingDeskId, null);
  const retry = store.refresh();
  fake.respond(2, snapshot(2, "bob"));
  await retry;
  assert.equal(store.snapshot.error, null);
  assert.equal(store.snapshot.desks[0]?.ownerUsername, "bob");
});

test("office switch discards successful mutation and its map result", async () => {
  const fake = deferredFetch();
  const store = new OfficeDesksController(fake.fetcher);
  store.configure(context);
  const initial = store.refresh();
  fake.respond(0, snapshot(1));
  await initial;
  const operation = store.claim(DESK_ID);
  store.configure({ ...context, officeId: "33333333-3333-3333-3333-333333333333" });
  fake.respond(1, { ...snapshot(2, "alice"), config: {} });
  assert.equal(await operation, null);
  assert.deepEqual(store.snapshot.desks, []);
  assert.equal(store.snapshot.pendingDeskId, null);
});

test("same-version reversed loads retain latest response and malformed JSON recovers", async () => {
  const fake = deferredFetch();
  const store = new OfficeDesksController(fake.fetcher);
  store.configure(context);
  const first = store.refresh();
  const second = store.refresh();
  fake.respond(1, snapshot(2, "alice"));
  await second;
  fake.respond(0, snapshot(2));
  await first;
  assert.equal(store.snapshot.desks[0]?.ownerUsername, "alice");
  const malformed = store.refresh();
  fake.requests[2]!.resolve(new Response("invalid-json"));
  await malformed;
  assert.equal(store.snapshot.loading, false);
  assert.ok(store.snapshot.error);
});


test("default browser fetch retains its global receiver contract", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function(this: unknown) {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    return new Response(JSON.stringify(snapshot(1, "alice")));
  };
  try {
    const store = new OfficeDesksController();
    store.configure(context);
    await store.refresh();
    assert.equal(store.snapshot.error, null);
    assert.equal(store.snapshot.desks[0]?.ownerUsername, "alice");
  } finally { globalThis.fetch = originalFetch; }
});
