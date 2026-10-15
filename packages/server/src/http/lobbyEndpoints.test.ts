import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { lobbyPageEndpoint } from "./lobbyEndpoints.js";
import { parseLobbyPageOptions } from "../infra/lobbyPagination.js";
import { listLobbyPage } from "../offices/lobbyRepository.js";

test("lobby paging rejects malformed parameters and clamps numeric bounds", () => {
  assert.deepEqual(parseLobbyPageOptions({}), { search: "", page: 1, pageSize: 12, offset: 0 });
  assert.deepEqual(parseLobbyPageOptions({ search: "  sage  ", page: "0", pageSize: "999" }), { search: "sage", page: 1, pageSize: 100, offset: 0 });
  for (const query of [{ page: "1.5" }, { pageSize: "no" }, { search: ["a", "b"] }, { page: "Infinity" }]) {
    assert.throws(() => parseLobbyPageOptions(query));
  }
});

test("all lobby lists paginate in SQL and retain the total on empty pages", async () => {
  for (const kind of ["offices", "invites", "users", "events"] as const) {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const store = { async query(sql: string, values: unknown[]) {
      calls.push({ sql, values });
      return { rows: [{ total: 25, items: [] }] };
    } } as unknown as Pick<PoolClient, "query">;
    const options = parseLobbyPageOptions({ search: "a_%", page: "4", pageSize: "12" });
    const result = await listLobbyPage(kind, { username: "alice", role: "user" }, options, {}, store);
    assert.equal(result.total, 25);
    assert.deepEqual(result.items, []);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.sql, /WITH filtered AS/);
    assert.match(calls[0]!.sql, /count\(\*\)/);
    assert.match(calls[0]!.sql, /LIMIT \$\d+ OFFSET \$\d+/);
    assert.equal(calls[0]!.values.includes("%a\\_\\%%"), true);
    assert.deepEqual(calls[0]!.values.slice(-2), [12, 36]);
    if (kind === "offices") {
      assert.match(calls[0]!.sql, /memberships.username IS NOT NULL/);
      assert.deepEqual(calls[0]!.values.slice(0, 2), ["alice", false]);
    }
    if (kind === "invites") {
      assert.match(calls[0]!.sql, /invites.invited_username = \$1/);
      assert.match(calls[0]!.sql, /invites.accepted_at IS NULL/);
      assert.equal(calls[0]!.values[0], "alice");
    }
  }
});

test("audit paging keeps existing exact action and target filters", async () => {
  let values: unknown[] = [];
  const store = { async query(_sql: string, params: unknown[]) { values = params; return { rows: [{ total: 0, items: [] }] }; } } as unknown as Pick<PoolClient, "query">;
  await listLobbyPage("events", { username: "admin", role: "maintainer" }, parseLobbyPageOptions({}), { action: " account.suspended ", targetType: "account", targetId: "alice" }, store);
  assert.deepEqual(values.slice(0, 4), [null, "account.suspended", "account", "alice"]);
});

test("lobby list authorization denies guests and non-maintainers before querying", async () => {
  let calls = 0;
  const list = async () => { calls++; return { items: [], total: 0 }; };
  for (const kind of ["offices", "invites", "users", "events"] as const) {
    assert.equal((await lobbyPageEndpoint(kind, null, {}, list)).status, kind === "users" || kind === "events" ? 403 : 401);
  }
  for (const kind of ["users", "events"] as const) {
    assert.equal((await lobbyPageEndpoint(kind, { username: "alice", role: "user" }, {}, list)).status, 403);
  }
  assert.equal(calls, 0);
  const result = await lobbyPageEndpoint("offices", { username: "alice", role: "user" }, { page: "2" }, list);
  assert.deepEqual(result, { status: 200, body: { offices: [], total: 0, page: 2, pageSize: 12 } });
  assert.equal(calls, 1);
  assert.equal((await lobbyPageEndpoint("offices", { username: "alice", role: "user" }, { page: "bad" }, list)).status, 400);
  assert.equal(calls, 1);
});
