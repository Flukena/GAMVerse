import assert from "node:assert/strict";
import test from "node:test";
import { accountSuspensionEndpoint } from "./accountSuspensionEndpoint.js";

const maintainer = { username: "operator", role: "maintainer" as const };
const suspendedAt = "2026-10-15T00:00:00.000Z";

test("suspension mutation and realtime invalidation use the canonical account", async () => {
  const mutations: unknown[][] = [];
  const disconnected: string[] = [];
  const result = await accountSuspensionEndpoint(maintainer, "  TarGet  ", true, {
    setSuspended: async (...args) => {
      mutations.push(args);
      return { suspendedAt };
    },
    disconnectAccount: async (username) => { disconnected.push(username); },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(mutations, [["operator", "target", true]]);
  assert.deepEqual(disconnected, ["target"]);
});

test("a persisted suspension retries realtime invalidation after failure", async () => {
  let disconnectAttempts = 0;
  const dependencies = {
    setSuspended: async () => ({ suspendedAt }),
    disconnectAccount: async () => {
      disconnectAttempts += 1;
      if (disconnectAttempts === 1) throw new Error("realtime unavailable");
    },
  };
  const first = await accountSuspensionEndpoint(maintainer, "target", true, dependencies);
  assert.equal(first.status, 503);
  assert.equal("activeSessionsDisconnected" in first.body && first.body.activeSessionsDisconnected, false);
  const retry = await accountSuspensionEndpoint(maintainer, "target", true, dependencies);
  assert.equal(retry.status, 200);
  assert.equal(disconnectAttempts, 2);
  assert.deepEqual(retry.body, { suspendedAt, activeSessionsDisconnected: true });
});

test("reactivation uses canonical identity and does not disconnect sessions", async () => {
  const result = await accountSuspensionEndpoint(maintainer, "  TarGet  ", false, {
    setSuspended: async (actor, username, suspended) => {
      assert.deepEqual([actor, username, suspended], ["operator", "target", false]);
      return { suspendedAt: null };
    },
    disconnectAccount: async () => { assert.fail("reactivation must not kick"); },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { suspendedAt: null });
});

test("suspension denial prevents mutations and realtime disconnects", async () => {
  const dependencies = {
    setSuspended: async () => { assert.fail("denied mutation"); },
    disconnectAccount: async () => { assert.fail("denied disconnect"); },
  };
  for (const session of [null, { username: "ordinary", role: "user" as const }]) {
    assert.equal((await accountSuspensionEndpoint(session, "target", true, dependencies)).status, 403);
  }
  assert.equal((await accountSuspensionEndpoint(maintainer, "target", "true", dependencies)).status, 400);
  assert.equal((await accountSuspensionEndpoint(maintainer, "invalid username!", true, dependencies)).status, 400);
});

test("a rejected suspension never disconnects the target account", async () => {
  const result = await accountSuspensionEndpoint(maintainer, "target", true, {
    setSuspended: async () => ({ error: "The last active maintainer cannot be suspended." }),
    disconnectAccount: async () => { assert.fail("rejected mutation must not kick"); },
  });
  assert.equal(result.status, 400);
});
