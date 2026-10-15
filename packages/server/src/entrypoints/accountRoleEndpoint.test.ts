import assert from "node:assert/strict";
import test from "node:test";
import { accountRoleEndpoint } from "./accountRoleEndpoint.js";

const maintainer = { username: "operator", role: "maintainer" as const };

test("retrying a persisted role change retries realtime invalidation", async () => {
  let persisted = false;
  let disconnectAttempts = 0;
  const dependencies = {
    setRole: async () => {
      const changed = !persisted;
      persisted = true;
      return { role: "user" as const, changed };
    },
    disconnectAccount: async () => {
      disconnectAttempts += 1;
      if (disconnectAttempts === 1) throw new Error("realtime unavailable");
    },
  };
  const first = await accountRoleEndpoint(maintainer, "target", "user", dependencies);
  assert.equal(first.status, 503);
  assert.equal("activeSessionsDisconnected" in first.body && first.body.activeSessionsDisconnected, false);
  const retry = await accountRoleEndpoint(maintainer, "target", "user", dependencies);
  assert.equal(retry.status, 200);
  assert.equal(disconnectAttempts, 2);
  assert.deepEqual(retry.body, { role: "user", changed: false, activeSessionsDisconnected: true });
});

test("role mutation and realtime invalidation use the same canonical account", async () => {
  const mutations: unknown[][] = [];
  const disconnected: string[] = [];
  const result = await accountRoleEndpoint(maintainer, "  TarGet  ", "user", {
    setRole: async (...args) => {
      mutations.push(args);
      return { role: "user", changed: true };
    },
    disconnectAccount: async (username) => { disconnected.push(username); },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(mutations, [["operator", "target", "user"]]);
  assert.deepEqual(disconnected, ["target"]);
});

test("unauthenticated and ordinary sessions cannot mutate or disconnect accounts", async () => {
  const dependencies = {
    setRole: async () => { assert.fail("unauthorized role mutation"); },
    disconnectAccount: async () => { assert.fail("unauthorized disconnect"); },
  };
  for (const session of [null, { username: "ordinary", role: "user" as const }]) {
    const result = await accountRoleEndpoint(session, "target", "user", dependencies);
    assert.equal(result.status, 403);
  }
});

test("invalid inputs and rejected role mutations never disconnect accounts", async () => {
  let mutations = 0;
  const dependencies = {
    setRole: async () => { mutations += 1; return { error: "The last active maintainer cannot be demoted." }; },
    disconnectAccount: async () => { assert.fail("rejected mutation must not disconnect"); },
  };
  assert.equal((await accountRoleEndpoint(maintainer, "target", "owner", dependencies)).status, 400);
  assert.equal((await accountRoleEndpoint(maintainer, "invalid username!", "user", dependencies)).status, 400);
  assert.equal((await accountRoleEndpoint(maintainer, "target", "user", dependencies)).status, 400);
  assert.equal(mutations, 1);
});
