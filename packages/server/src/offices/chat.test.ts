import { CHAT_MIN_INTERVAL_MS, CHAT_BURST_CAP, CHAT_BURST_WINDOW_MS } from "@gammyverse/shared";
import assert from "node:assert/strict";
import test from "node:test";
import { OfficeChat, ChatRateLimiter, resolveChatRecipients } from "./chat.js";
test("nearby recipients match server group and office reaches all", () => {
  const people = [
    { sessionId: "a", username: "alice", channel: "group1" },
    { sessionId: "b", username: "bob", channel: "group1" },
    { sessionId: "c", username: "carol", channel: "group2" },
  ];
  assert.deepEqual(resolveChatRecipients("nearby", "a", people), ["a", "b"]);
  assert.deepEqual(resolveChatRecipients("dm", "a", people, "bob"), ["a", "b"]);
  assert.deepEqual(resolveChatRecipients("office", "a", people), [
    "a",
    "b",
    "c",
  ]);
});
test("rate limiter rejects immediate repeat and caps burst", () => {
  const gate = new ChatRateLimiter();
  assert.equal(gate.accept("alice", 0), true);
  assert.equal(gate.accept("alice", 1), false);
  for (let i = 1; i < 5; i++) assert.equal(gate.accept("alice", i * 500), true);
  assert.equal(gate.accept("alice", 2500), false);
  assert.equal(gate.accept("alice", 5000), true);
});
test("non-members cannot send; DM target membership and persistence checked before delivery", async () => {
  const delivered: unknown[] = [];
  let fail = false;
  let now = 0;
  const chat = new OfficeChat("office", {
    role: async (user) => (user === "stranger" ? null : "user"),
    persist: async () => {
      if (fail) throw new Error("offline");
      return { id: "1", createdAt: new Date().toISOString() };
    },
    now: () => now,
    people: () => [{ sessionId: "a", username: "alice", channel: "x" }],
    deliver: (_id, message) => delivered.push(message),
  });
  await assert.rejects(
    chat.send("a", "stranger", { scope: "office", text: "hello" }),
  );
  await assert.rejects(
    chat.send("a", "alice", {
      scope: "dm",
      text: "hello",
      targetUsername: "stranger",
    }),
  );
  fail = true;
  now = CHAT_MIN_INTERVAL_MS;
  await assert.rejects(
    chat.send("a", "alice", { scope: "office", text: "hello" }),
    /offline/,
  );
  assert.equal(delivered.length, 0);
});
test("consecutive nearby events have distinct IDs and authenticated identity", async () => {
  let now = 0;
  const messages: {
    id: string;
    senderUsername: string;
  }[] = [];
  const chat = new OfficeChat("office", {
    role: async () => "user",
    persist: async () => {
      throw new Error("Nearby must not persist");
    },
    now: () => now,
    people: () => [{ sessionId: "a", username: "alice", channel: "a" }],
    deliver: (_id, message) => messages.push(message),
  });
  await chat.send("a", "alice", {
    scope: "nearby",
    text: "first",
    senderUsername: "attacker",
  });
  now = 500;
  await chat.send("a", "alice", { scope: "nearby", text: "second" });
  assert.equal(messages.length, 2);
  assert.notEqual(messages[0]!.id, messages[1]!.id);
  assert.equal(messages[0]!.senderUsername, "alice");
});

test("throttled sends do no membership queries and live timestamp equals persisted row", async () => {
  let queries = 0;
  const sentAt = "2026-10-14T01:02:03.000Z";
  const delivered: { createdAt: string }[] = [];
  const chat = new OfficeChat("office", {
    role: async () => {
      queries += 1;
      return "user";
    },
    persist: async () => ({ id: "9", createdAt: sentAt }),
    now: () => 0,
    people: () => [{ sessionId: "a", username: "alice", channel: "x" }],
    deliver: (_id, message) => {
      delivered.push(message);
    },
  });
  await chat.send("a", "alice", { scope: "office", text: "hello" });
  const before = queries;
  await assert.rejects(
    chat.send("a", "alice", {
      scope: "dm",
      text: "repeat",
      targetUsername: "bob",
    }),
  );
  assert.equal(queries, before);
  assert.equal(delivered[0]!.createdAt, sentAt);
});
test("chat throttle evicts stale windows only, so reconnecting cannot reset the burst cap", () => {
  const gate = new ChatRateLimiter();
  assert.equal("forget" in gate, false);
  let accepted = 0;
  while (accepted < CHAT_BURST_CAP && gate.accept("alice", accepted * CHAT_MIN_INTERVAL_MS)) accepted += 1;
  assert.ok(accepted > 0);
  assert.equal(accepted, CHAT_BURST_CAP);
  assert.equal(gate.accept("alice", accepted * CHAT_MIN_INTERVAL_MS), false);
  gate.accept("bob", (CHAT_BURST_CAP - 1) * CHAT_MIN_INTERVAL_MS + CHAT_BURST_WINDOW_MS);
  assert.equal(gate.size, 1);
});

test("live persisted chat uses database created_at rather than application clock", async () => {
  const databaseTime = "2026-01-02T03:04:05.000Z";
  const delivered: { createdAt: string }[] = [];
  const chat = new OfficeChat("office", {
    role: async () => "user",
    persist: async () => ({ id: "10", createdAt: databaseTime }),
    people: () => [{ sessionId: "a", username: "alice", channel: "x" }],
    deliver: (_id, message) => {
      delivered.push(message);
    },
  });
  await chat.send("a", "alice", { scope: "office", text: "saved" });
  assert.equal(delivered[0]!.createdAt, databaseTime);
});

test("exhausted chat burst stays throttled when a dropped user rejoins with a new session", async () => {
  const username = "burst-user";
  const oldSessionId = "before-drop";
  const newSessionId = "after-rejoin";
  const payload = { scope: "office", text: "burst" };
  let now = 0;
  let membershipQueries = 0;
  let sessionId = oldSessionId;
  const delivered: string[] = [];
  const chat = new OfficeChat("burst-office", {
    role: async () => { membershipQueries += 1; return "user"; },
    now: () => now,
    people: () => [{ username, sessionId, channel: "office" }],
    persist: async () => ({ id: "burst-message", createdAt: new Date(now).toISOString() }),
    deliver: id => { delivered.push(id); },
  });
  for (let sendCount = 0; sendCount < CHAT_BURST_CAP; sendCount += 1) {
    await chat.send(oldSessionId, username, payload);
    now += CHAT_MIN_INTERVAL_MS;
  }
  assert.equal(delivered.length, CHAT_BURST_CAP);
  const queriesBefore = membershipQueries;
  sessionId = newSessionId;
  await assert.rejects(chat.send(newSessionId, username, payload), /rate limit exceeded/);
  assert.equal(membershipQueries, queriesBefore);
  assert.equal(delivered.length, CHAT_BURST_CAP);
  now = CHAT_BURST_WINDOW_MS;
  await chat.send(newSessionId, username, payload);
  assert.equal(delivered.at(-1), newSessionId);
});
