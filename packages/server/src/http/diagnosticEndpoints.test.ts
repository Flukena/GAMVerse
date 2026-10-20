import assert from "node:assert/strict";
import test from "node:test";
import { DiagnosticRateLimit } from "../infra/diagnostics.js";
import { receiveDiagnostic, readDiagnostics } from "./diagnosticEndpoints.js";

const maintainer = { username: "operator", role: "maintainer" as const };
const ordinary = { username: "member", role: "user" as const };
const report = { code: "browser_error", officeId: "6ab38a35-5227-4e93-99e1-d23624810a7b", metrics: {} };
function setup() {
  let inserted = 0;
  let listed = 0;
  const dependencies = {
    insert: async () => { inserted++; },
    list: async () => { listed++; return { items: [], nextCursor: null }; },
    officeRole: async () => "user" as const,
    perUser: new DiagnosticRateLimit(), global: new DiagnosticRateLimit(),
  };
  return { dependencies, counts: () => ({ inserted, listed }) };
}

test("only platform maintainers can read global diagnostic records", async () => {
  const { dependencies, counts } = setup();
  for (const session of [null, ordinary]) assert.equal((await readDiagnostics(session, undefined, dependencies)).status, 403);
  for (const cursor of ["-1", "0", "1 OR true", "9".repeat(19), ["1"]]) {
    assert.equal((await readDiagnostics(maintainer, cursor, dependencies)).status, 400);
  }
  assert.equal((await readDiagnostics(maintainer, "12", dependencies)).status, 200);
  assert.deepEqual(counts(), { inserted: 0, listed: 1 });
});

test("ingestion requires authentication, valid technical data and current office access", async () => {
  const { dependencies, counts } = setup();
  assert.equal((await receiveDiagnostic(null, report, dependencies)).status, 401);
  assert.equal((await receiveDiagnostic(ordinary, { ...report, token: "secret" }, dependencies)).status, 400);
  assert.equal((await receiveDiagnostic(ordinary, report, { ...dependencies, officeRole: async () => null })).status, 403);
  assert.equal(counts().inserted, 0);
  assert.equal((await receiveDiagnostic(ordinary, report, dependencies)).status, 201);
  assert.equal(counts().inserted, 1);
});

test("per-account and global admission are bounded before persistence, including across offices", async () => {
  const { dependencies, counts } = setup();
  for (let i = 0; i < 6; i++) assert.equal((await receiveDiagnostic(ordinary, report, dependencies)).status, 201);
  assert.equal((await receiveDiagnostic(ordinary, { ...report, officeId: null }, dependencies)).status, 429);
  for (let i = 0; i < 114; i++) {
    assert.equal((await receiveDiagnostic({ ...ordinary, username: `user${i}` }, report, dependencies)).status, 201);
  }
  assert.equal((await receiveDiagnostic(maintainer, report, dependencies)).status, 429);
  assert.equal(counts().inserted, 120);
});

test("failed persistence rejects instead of returning success", async () => {
  const { dependencies } = setup();
  await assert.rejects(receiveDiagnostic(ordinary, report, {
    ...dependencies, insert: async () => { throw new Error("database unavailable"); },
  }), /database unavailable/);
});

test("rate limit expires at one minute and bounds tracked keys", () => {
  const gate = new DiagnosticRateLimit(2);
  assert.equal(gate.allow("a", 1, 0), true);
  assert.equal(gate.allow("a", 1, 59_999), false);
  assert.equal(gate.allow("b", 1, 59_999), true);
  assert.equal(gate.allow("c", 1, 59_999), false);
  assert.equal(gate.allow("c", 1, 60_000), true);
  assert.equal(gate.allow("a", 1, 60_000), false);
});
