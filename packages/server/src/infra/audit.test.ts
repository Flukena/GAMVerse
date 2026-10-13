import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { listMaintainerAuditEvents, normalizeMaintainerAuditOptions, recordAuditEvent } from "./audit.js";

function fakeQueryable(rows: unknown[] = []) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const queryable = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      return { rows };
    },
  } as unknown as PoolClient;
  return { queryable, calls };
}

test("audit query normalization supplies defaults, caps paging, and trims filters", () => {
  assert.deepEqual(normalizeMaintainerAuditOptions(), {
    limit: 50, offset: 0, action: null, targetType: null, targetId: null,
  });
  assert.deepEqual(normalizeMaintainerAuditOptions({
    limit: 999, offset: 25_000, action: ` ${"x".repeat(100)} `, targetType: " account ", targetId: " target ",
  }), {
    limit: 200, offset: 9_999, action: "x".repeat(80), targetType: "account", targetId: "target",
  });
  assert.deepEqual(normalizeMaintainerAuditOptions({ limit: 0, offset: -2 }), {
    limit: 1, offset: 0, action: null, targetType: null, targetId: null,
  });
});

test("audit listing parameterizes normalized filters and maps timestamps", async () => {
  const occurredAt = new Date("2026-10-13T02:03:04.000Z");
  const { queryable, calls } = fakeQueryable([{
    id: "7", actor_username: "maintainer", action: "office_member.role_changed", target_type: "account",
    target_id: "alice", metadata: { officeId: "office-1" }, occurred_at: occurredAt,
  }]);
  const events = await listMaintainerAuditEvents({ limit: 500, offset: 3, action: " office_member.role_changed ", targetType: " account ", targetId: " alice " }, queryable);
  assert.deepEqual(calls[0]?.values, ["office_member.role_changed", "account", "alice", 200, 3]);
  assert.match(calls[0]?.sql ?? "", /action = \$1/);
  assert.match(calls[0]?.sql ?? "", /LIMIT \$4 OFFSET \$5/);
  assert.deepEqual(events, [{
    id: "7", actorUsername: "maintainer", action: "office_member.role_changed", targetType: "account",
    targetId: "alice", metadata: { officeId: "office-1" }, occurredAt: "2026-10-13T02:03:04.000Z",
  }]);
});

test("audit recording persists only action-allowlisted metadata and bounds retention", async () => {
  const { queryable, calls } = fakeQueryable();
  await recordAuditEvent(queryable, {
    actorUsername: "maintainer",
    action: "office_member.role_changed",
    targetType: "account",
    targetId: "alice",
    metadata: {
      officeId: "office-1", fromRole: "user", toRole: "admin",
      token: "reset-token-secret", password: "password-secret", sessionId: "session-secret", requestBody: "private body",
    },
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0]?.sql ?? "", /INSERT INTO app_maintainer_audit/);
  assert.deepEqual(calls[0]?.values?.slice(0, 4), ["maintainer", "office_member.role_changed", "account", "alice"]);
  assert.deepEqual(JSON.parse(String(calls[0]?.values?.[4])), { officeId: "office-1", fromRole: "user", toRole: "admin" });
  assert.equal(JSON.stringify(calls).includes("secret"), false);
  assert.match(calls[1]?.sql ?? "", /ORDER BY occurred_at DESC, id DESC LIMIT \$1/);
  assert.deepEqual(calls[1]?.values, [10_000]);
});
