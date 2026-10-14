import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { chatHistory, persistChatMessage } from "./chatRepository.js";
const OFFICE_ID = "office";
function querySeam(rows: unknown[] = [], cursorRows: unknown[] = rows) {
  const calls: {
    sql: string;
    values: unknown[];
  }[] = [];
  const store = {
    query: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      return { rows: sql.includes("AND id=$2::bigint") ? cursorRows : rows };
    },
  } as unknown as Pool;
  return { store, calls };
}
test("DM history binds requester target pair and same-conversation cursor inside office", async () => {
  const { store, calls } = querySeam();
  await chatHistory(
    "carol",
    OFFICE_ID,
    "dm",
    "bob",
    undefined,
    store,
    async () => "user",
  );
  assert.deepEqual(calls[0]!.values.slice(0, 5), [
    OFFICE_ID,
    "dm",
    "carol",
    "bob",
    null,
  ]);
  assert.match(calls[0]!.sql, /office_id=\$1 AND scope=\$2/);
  assert.match(calls[0]!.sql, /sender_username=\$3 AND recipient_username=\$4/);
  assert.match(calls[0]!.sql, /sender_username=\$4 AND recipient_username=\$3/);
  assert.match(
    calls[0]!.sql,
    /EXISTS\(SELECT 1 FROM conversation WHERE id=\$5::bigint\)/,
  );
  assert.equal(calls[0]!.sql.includes("carol"), false);
});
test("cross-office nonmember and nonmember DM target rejected before history query", async () => {
  const { store, calls } = querySeam();
  await assert.rejects(
    chatHistory(
      "alice",
      "foreign",
      "office",
      undefined,
      undefined,
      store,
      async () => null,
    ),
  );
  await assert.rejects(
    chatHistory(
      "alice",
      OFFICE_ID,
      "dm",
      "stranger",
      undefined,
      store,
      async (user) => (user === "alice" ? "user" : null),
    ),
  );
  assert.equal(calls.length, 0);
});
const SENT_AT = new Date("2026-10-14T00:00:00Z");
function dmRow(id: string, office: string, sender: string, recipient: string) {
  return {
    id,
    office_id: office,
    scope: "dm",
    sender_username: sender,
    recipient_username: recipient,
    body: "private",
    created_at: SENT_AT,
  };
}
test("third office member cannot read alice bob DM even with adversarial storage rows", async () => {
  const { store } = querySeam([dmRow("2", OFFICE_ID, "alice", "bob")]);
  assert.deepEqual(
    await chatHistory(
      "carol",
      OFFICE_ID,
      "dm",
      "bob",
      undefined,
      store,
      async () => "user",
    ),
    [],
  );
});
test("foreign cursor returns nothing and cross-office rows never enter history", async () => {
  const allowed = dmRow("2", OFFICE_ID, "alice", "bob");
  const foreign = dmRow("3", "other-office", "alice", "bob");
  const { store } = querySeam([allowed, foreign], [foreign]);
  assert.deepEqual(
    await chatHistory(
      "alice",
      OFFICE_ID,
      "dm",
      "bob",
      "3",
      store,
      async () => "user",
    ),
    [],
  );
  const messages = await chatHistory(
    "alice",
    OFFICE_ID,
    "dm",
    "bob",
    undefined,
    store,
    async () => "user",
  );
  assert.deepEqual(
    messages.map((message) => message.id),
    ["2"],
  );
});

test("persist prunes the shared office pool atomically and always releases connection", async () => {
  const calls: { sql: string; values?: unknown[] }[] = [];
  let released = false;
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return {
        rows: sql.startsWith("INSERT")
          ? [{ id: "73", created_at: SENT_AT }]
          : sql.startsWith("SELECT count")
            ? [{ count: "10001" }]
            : [],
      };
    },
    release: () => {
      released = true;
    },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const message = {
    id: "",
    officeId: OFFICE_ID,
    scope: "dm" as const,
    senderUsername: "alice",
    recipientUsername: "bob",
    text: "message",
    createdAt: SENT_AT.toISOString(),
  };
  assert.deepEqual(await persistChatMessage(message, pool), {
    id: "73",
    createdAt: SENT_AT.toISOString(),
  });
  assert.equal(released, true);
  assert.equal(calls[0]!.sql, "BEGIN");
  assert.equal(calls.at(-1)!.sql, "COMMIT");
  const prune = calls.find((call) => call.sql.startsWith("DELETE"))!;
  assert.deepEqual(prune.values, [OFFICE_ID, 0]);
  assert.match(prune.sql, /WHERE office_id=\$1/);
  assert.match(prune.sql, /ORDER BY id ASC LIMIT 1 OFFSET \$2/);
  assert.equal(prune.sql.includes("scope="), false);
});
test("persistence failure rolls back, releases and never reports a message id", async () => {
  const calls: string[] = [];
  let released = false;
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("DELETE")) throw new Error("prune unavailable");
      return {
        rows: sql.startsWith("SELECT count")
          ? [{ count: "10001" }]
          : [{ id: "74", created_at: SENT_AT }],
      };
    },
    release: () => {
      released = true;
    },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  await assert.rejects(
    persistChatMessage(
      {
        id: "",
        officeId: OFFICE_ID,
        scope: "office",
        senderUsername: "alice",
        text: "message",
        createdAt: SENT_AT.toISOString(),
      },
      pool,
    ),
    /prune unavailable/,
  );
  assert.equal(calls.at(-1), "ROLLBACK");
  assert.equal(calls.includes("COMMIT"), false);
  assert.equal(released, true);
});
test("history binds page-size and descending cursor limits for consecutive pages", async () => {
  const rows = Array.from({ length: 60 }, (_, index) =>
    dmRow(String(100 - index), OFFICE_ID, "alice", "bob"),
  );
  const { store, calls } = querySeam(rows, [
    dmRow("100", OFFICE_ID, "alice", "bob"),
  ]);
  const first = await chatHistory(
    "alice",
    OFFICE_ID,
    "dm",
    "bob",
    undefined,
    store,
    async () => "user",
  );
  assert.equal(first.length, 50);
  assert.deepEqual(
    first.map((message) => message.id),
    rows
      .slice(0, 50)
      .reverse()
      .map((row) => row.id),
  );
  await chatHistory(
    "alice",
    OFFICE_ID,
    "dm",
    "bob",
    "100",
    store,
    async () => "user",
  );
  const query = calls.at(-1)!;
  assert.equal(query.values[4], "100");
  assert.equal(query.values[5], 50);
  assert.match(query.sql, /id<\$5::bigint/);
  assert.match(query.sql, /ORDER BY id DESC LIMIT \$6/);
});

test("normal retained office skips deletion scan", async () => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      return {
        rows: sql.startsWith("INSERT")
          ? [{ id: "7", created_at: SENT_AT }]
          : [{ count: "2" }],
      };
    },
    release: () => {},
  };
  await persistChatMessage(
    {
      id: "",
      officeId: OFFICE_ID,
      scope: "office",
      senderUsername: "alice",
      text: "hi",
      createdAt: SENT_AT.toISOString(),
    },
    { connect: async () => client } as unknown as Pool,
  );
  assert.equal(
    calls.some((sql) => sql.startsWith("DELETE")),
    false,
  );
});
