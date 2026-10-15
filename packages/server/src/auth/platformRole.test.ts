import assert from "node:assert/strict";
import test from "node:test";
import { setAccountPlatformRole } from "./platformRole.js";

function roleStore(options: {
  maintainer?: boolean;
  suspended?: boolean;
  activeMaintainers?: number;
  missing?: boolean;
  failAudit?: boolean;
} = {}) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  let releases = 0;
  let connections = 0;
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT is_maintainer")) {
        return { rows: options.missing ? [] : [{
          is_maintainer: options.maintainer ?? true,
          suspended_at: options.suspended ? new Date("2026-10-15T00:00:00Z") : null,
        }] };
      }
      if (sql.startsWith("SELECT count")) {
        return { rows: [{ count: String(options.activeMaintainers ?? 2) }] };
      }
      if (options.failAudit && sql.startsWith("INSERT INTO app_maintainer_audit")) {
        throw new Error("audit unavailable");
      }
      return { rows: [] };
    },
    release() { releases += 1; },
  };
  const database = {
    async connect() { connections += 1; return client; },
  } as unknown as NonNullable<Parameters<typeof setAccountPlatformRole>[3]>;
  return {
    database,
    calls,
    get releases() { return releases; },
    get connections() { return connections; },
  };
}

test("self-role changes are rejected after canonicalization before acquiring a DB client", async () => {
  const store = roleStore();
  const result = await setAccountPlatformRole("operator", "  OPERATOR  ", "user", store.database);
  assert.deepEqual(result, { error: "You cannot change your own platform role." });
  assert.equal(store.connections, 0);
  assert.deepEqual(store.calls, []);
});

test("last active maintainer demotion locks first, rolls back, and never mutates", async () => {
  const store = roleStore({ activeMaintainers: 1 });
  const result = await setAccountPlatformRole("operator", "target", "user", store.database);
  assert.deepEqual(result, { error: "The last active maintainer cannot be demoted." });
  assert.equal(store.calls[0].sql, "BEGIN");
  // This must be the same advisory lock used by account suspension.
  assert.equal(store.calls[1].sql, "SELECT pg_advisory_xact_lock(724031106)");
  assert.match(store.calls[2].sql, /WHERE username = \$1 FOR UPDATE$/);
  assert.deepEqual(store.calls[2].values, ["target"]);
  assert.match(store.calls[3].sql, /is_maintainer = TRUE AND suspended_at IS NULL/);
  assert.equal(store.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(store.calls.some(({ sql }) => /^(UPDATE|INSERT|COMMIT)/.test(sql)), false);
  assert.equal(store.releases, 1);
});

test("demotion revokes target sessions and audits the change in the same transaction", async () => {
  const store = roleStore();
  assert.deepEqual(await setAccountPlatformRole("operator", "  TARGET  ", "user", store.database), {
    role: "user", changed: true,
  });
  const roleUpdate = store.calls.findIndex(({ sql }) => sql.startsWith("UPDATE app_users"));
  const sessionUpdate = store.calls.findIndex(({ sql }) => sql.startsWith("UPDATE app_sessions"));
  const auditInsert = store.calls.findIndex(({ sql }) => sql.startsWith("INSERT INTO app_maintainer_audit"));
  assert.deepEqual(store.calls[roleUpdate].values, ["target", false]);
  assert.match(store.calls[sessionUpdate].sql, /revoked_at = now\(\).*username = \$1 AND revoked_at IS NULL/);
  assert.deepEqual(store.calls[sessionUpdate].values, ["target"]);
  assert.ok(roleUpdate > 3 && sessionUpdate > roleUpdate && auditInsert > sessionUpdate);
  assert.deepEqual(store.calls[auditInsert].values, [
    "operator", "account.role_changed", "account", "target",
    JSON.stringify({ fromRole: "maintainer", toRole: "user" }),
  ]);
  assert.equal(store.calls.at(-1)?.sql, "COMMIT");
  assert.equal(store.releases, 1);
});

test("audit failure rolls back role and session writes and always releases the client", async () => {
  const store = roleStore({ failAudit: true });
  await assert.rejects(
    setAccountPlatformRole("operator", "target", "user", store.database),
    /audit unavailable/,
  );
  assert.equal(store.calls.some(({ sql }) => sql.startsWith("UPDATE app_users")), true);
  assert.equal(store.calls.some(({ sql }) => sql.startsWith("UPDATE app_sessions")), true);
  assert.equal(store.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(store.calls.some(({ sql }) => sql === "COMMIT"), false);
  assert.equal(store.releases, 1);
});

test("unchanged role commits without role writes, session revocation, or duplicate audit", async () => {
  const store = roleStore();
  assert.deepEqual(await setAccountPlatformRole("operator", "target", "maintainer", store.database), {
    role: "maintainer", changed: false,
  });
  assert.equal(store.calls.at(-1)?.sql, "COMMIT");
  assert.equal(store.calls.some(({ sql }) => /^(UPDATE|INSERT|DELETE)/.test(sql)), false);
  assert.equal(store.releases, 1);
});

test("promotion also revokes old sessions and does not require an active-maintainer count", async () => {
  const store = roleStore({ maintainer: false });
  assert.deepEqual(await setAccountPlatformRole("operator", "target", "maintainer", store.database), {
    role: "maintainer", changed: true,
  });
  assert.equal(store.calls.some(({ sql }) => sql.startsWith("SELECT count")), false);
  assert.deepEqual(store.calls.find(({ sql }) => sql.startsWith("UPDATE app_users"))?.values, ["target", true]);
  assert.deepEqual(store.calls.find(({ sql }) => sql.startsWith("UPDATE app_sessions"))?.values, ["target"]);
  assert.equal(store.releases, 1);
});

test("missing target rolls back and unavailable storage fails closed", async () => {
  const store = roleStore({ missing: true });
  assert.deepEqual(await setAccountPlatformRole("operator", "target", "user", store.database), { error: "Account not found." });
  assert.equal(store.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(store.calls.some(({ sql }) => /^(UPDATE|INSERT|COMMIT)/.test(sql)), false);
  assert.equal(store.releases, 1);
  assert.deepEqual(await setAccountPlatformRole("operator", "target", "user", null), {
    error: "Platform role changes require the PostgreSQL audit store.",
  });
});
