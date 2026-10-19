import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CHARACTER_ID } from "@gammyverse/shared";
import { registerDeskAssignmentEndpoints } from "./deskAssignmentEndpoints.js";
import { DeskAssignmentRequests, DESK_ASSIGNMENT_REQUEST_INTERVAL_MS } from "./deskAssignmentRequests.js";
import { DeskAssignmentError } from "../offices/deskAssignments.js";
import type { HttpRequest, HttpResponse } from "./middleware.js";

const OFFICE_ID = "00000000-0000-4000-8000-000000000001";
const DESK_ID = "00000000-0000-4000-8000-000000000002";
const REQUEST_ID = "00000000-0000-4000-8000-000000000003";
const PATH = "/offices/:officeId/desks/assignments";
const command = { requestId: REQUEST_ID, expectedConfigVersion: 1, action: "assign", deskId: DESK_ID, expectedOwnerUsername: null, ownerUsername: "bob" };
const user = { username: "alice", role: "user" as const, characterId: DEFAULT_CHARACTER_ID, nickname: null };
type Handler = (request: HttpRequest, response: HttpResponse) => Promise<void>;

function response() {
  const result = { status: 200, body: undefined as unknown };
  const reply = { setHeader: () => {}, status: (code: number) => { result.status = code; return reply; }, json: (body: unknown) => { result.body = body; } };
  return { result, reply: reply as unknown as HttpResponse };
}
function request(token = "session"): HttpRequest {
  return { params: { officeId: OFFICE_ID }, body: command, header: () => `gv_session=${token}` } as unknown as HttpRequest;
}

test("HTTP assignment flood has one authentication and transaction in flight, and finally cleanup permits a later request", async () => {
  const handlers = new Map<string, Handler>();
  let nowMs = 0;
  let sessionReads = 0;
  let changes = 0;
  let resolve!: (value: never) => void;
  registerDeskAssignmentEndpoints({ get: (_path, handler) => { handlers.set("get", handler); }, post: (_path, handler) => { handlers.set("post", handler); } }, {
    session: async () => { sessionReads += 1; return user; },
    service: { list: async () => { throw new Error("unused"); }, change: async () => { changes += 1; return new Promise(resolvePromise => { resolve = resolvePromise; }); } },
    tokens: new DeskAssignmentRequests(() => nowMs), actors: new DeskAssignmentRequests(() => nowMs),
  });
  const first = response();
  const pending = handlers.get("post")!(request(), first.reply);
  await new Promise(done => setImmediate(done));
  const replies = Array.from({ length: 5 }, () => response());
  await Promise.all(replies.map(reply => handlers.get("post")!(request(), reply.reply)));
  assert.equal(sessionReads, 1);
  assert.equal(changes, 1);
  assert.equal(replies.every(reply => reply.result.status === 429), true);
  resolve({ persisted: true, realtimeSync: "pending" } as never);
  await pending;
  assert.equal(first.result.status, 200);
  assert.deepEqual(first.result.body, { persisted: true, realtimeSync: "pending" });
  nowMs += DESK_ASSIGNMENT_REQUEST_INTERVAL_MS;
  const later = response();
  const next = handlers.get("post")!(request(), later.reply);
  await new Promise(done => setImmediate(done));
  assert.equal(changes, 2);
  resolve({ persisted: true, realtimeSync: "applied" } as never);
  await next;
});

test("HTTP validation rejects actor spoofing and permission errors safely without leaking infrastructure errors", async () => {
  let calls = 0;
  const handlers = new Map<string, Handler>();
  registerDeskAssignmentEndpoints({ get: (path, handler) => { assert.equal(path, PATH); handlers.set("get", handler); }, post: (path, handler) => { assert.equal(path, PATH); handlers.set("post", handler); } }, {
    session: async () => user,
    service: { list: async () => { throw new Error("sensitive SQL detail"); }, change: async () => { calls += 1; throw new DeskAssignmentError("forbidden", "Access denied."); } },
  });
  const invalid = response();
  await handlers.get("post")!({ ...request(), body: { ...command, actorUsername: "admin" } }, invalid.reply);
  assert.equal(invalid.result.status, 400);
  assert.equal(calls, 0);
  const denied = response();
  await handlers.get("post")!(request("other-session"), denied.reply);
  assert.equal(denied.result.status, 429);
  const separateHandlers = new Map<string, Handler>();
  let nowMs = 0;
  registerDeskAssignmentEndpoints({ get: (_path, handler) => { separateHandlers.set("get", handler); }, post: (_path, handler) => { separateHandlers.set("post", handler); } }, {
    session: async () => user,
    service: { list: async () => { throw new Error("sensitive SQL detail"); }, change: async () => { throw new DeskAssignmentError("forbidden", "Access denied."); } },
    tokens: new DeskAssignmentRequests(() => nowMs), actors: new DeskAssignmentRequests(() => nowMs),
  });
  const forbidden = response();
  await separateHandlers.get("post")!(request(), forbidden.reply);
  assert.equal(forbidden.result.status, 403);
  assert.deepEqual(forbidden.result.body, { code: "forbidden", error: "Access denied." });
  nowMs += DESK_ASSIGNMENT_REQUEST_INTERVAL_MS;
  const unavailable = response();
  await separateHandlers.get("get")!(request(), unavailable.reply);
  assert.equal(unavailable.result.status, 503);
  assert.equal(JSON.stringify(unavailable.result.body).includes("sensitive SQL detail"), false);
});
