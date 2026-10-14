import assert from "node:assert/strict";
import test from "node:test";
import { readReconnectAccess, SessionSecurity } from "./sessionSecurity.js";
import { Spotlight } from "./spotlight.js";

const USERNAME = "alice";
const SESSION_ID = "dropped-session";
const NEW_SESSION_ID = "new-session";
const OFFICE_ID = "security-office";
const ACTIVE_ACCESS = { accountActive: true, officeMember: true, playerExists: true };

function fixture() {
  const security = new SessionSecurity();
  security.activate(USERNAME, SESSION_ID);
  const rejections: Error[] = [];
  security.reserve(USERNAME, SESSION_ID, { reject: error => rejections.push(error) });
  let rotations = 0;
  const spotlight = new Spotlight(OFFICE_ID, {
    role: async () => "owner",
    revoke: async () => {},
    changed: () => { rotations += 1; },
  });
  return { security, rejections, spotlight, rotations: () => rotations };
}

test("drop then suspension rejects pending seat and reconnect stays denied after account reactivation", () => {
  const f = fixture();
  assert.equal(f.security.revoke(SESSION_ID), true);
  assert.equal(f.rejections.length, 1);
  assert.equal(f.security.canReconnect(USERNAME, SESSION_ID, { ...ACTIVE_ACCESS, accountActive: false }), false);
  assert.equal(f.security.canReconnect(USERNAME, SESSION_ID, ACTIVE_ACCESS), false);
  assert.equal(f.security.revoke(SESSION_ID), false);
  assert.equal(f.rejections.length, 1);
});

test("office close rejects every seat and requests exactly one spotlight rotation", async () => {
  const f = fixture();
  const otherUsername = "bob";
  f.security.activate(otherUsername, NEW_SESSION_ID);
  f.security.reserve(otherUsername, NEW_SESSION_ID, { reject: error => f.rejections.push(error) });
  if (f.security.close()) await f.spotlight.close();
  if (f.security.close()) await f.spotlight.close();
  assert.equal(f.rejections.length, 2);
  assert.equal(f.rotations(), 1);
  assert.equal(f.security.canReconnect(USERNAME, SESSION_ID, ACTIVE_ACCESS), false);
  assert.equal(f.security.canReconnect(otherUsername, NEW_SESSION_ID, ACTIVE_ACCESS), false);
});

test("replacement during awaited access query denies stale restore", async () => {
  const f = fixture();
  let resolveAccess!: (value: typeof ACTIVE_ACCESS) => void;
  const query = new Promise<typeof ACTIVE_ACCESS>(resolve => { resolveAccess = resolve; });
  const reconnect = async () => f.security.canReconnect(USERNAME, SESSION_ID, await query);
  const pending = reconnect();
  f.security.activate(USERNAME, NEW_SESSION_ID);
  resolveAccess(ACTIVE_ACCESS);
  assert.equal(await pending, false);
  assert.equal(f.security.canReconnect(USERNAME, NEW_SESSION_ID, ACTIVE_ACCESS), true);
});

test("final leave clears marker without clearing replacement owner; new security event rotates", async () => {
  const f = fixture();
  if (f.security.revoke(SESSION_ID)) await f.spotlight.depart(USERNAME, "security");
  assert.equal(f.security.revoke(SESSION_ID), false);
  f.security.activate(USERNAME, NEW_SESSION_ID);
  f.security.finish(USERNAME, SESSION_ID);
  assert.equal(f.security.activeSession(USERNAME), NEW_SESSION_ID);
  if (f.security.revoke(NEW_SESSION_ID)) await f.spotlight.depart(USERNAME, "security");
  assert.equal(f.rotations(), 2);
  f.security.finish(USERNAME, NEW_SESSION_ID);
  f.security.activate(USERNAME, SESSION_ID);
  assert.equal(f.security.canReconnect(USERNAME, SESSION_ID, ACTIVE_ACCESS), true);
});

test("ordinary drop permits active member to reconnect without rotation; missing access or player denies", () => {
  const f = fixture();
  assert.equal(f.security.canReconnect(USERNAME, SESSION_ID, ACTIVE_ACCESS), true);
  assert.equal(f.rotations(), 0);
  assert.equal(f.rejections.length, 0);
  assert.equal(f.security.canReconnect(USERNAME, SESSION_ID, { ...ACTIVE_ACCESS, accountActive: false }), false);
  assert.equal(f.security.canReconnect(USERNAME, SESSION_ID, { ...ACTIVE_ACCESS, officeMember: false }), false);
  assert.equal(f.security.canReconnect(USERNAME, SESSION_ID, { ...ACTIVE_ACCESS, playerExists: false }), false);
});

test("delayed old-seat cleanup cannot remove a newer seat and revoked session cannot reserve", () => {
  const f = fixture();
  const oldSeat = { reject: (_error: Error) => {} };
  const newSeat = { reject: (error: Error) => f.rejections.push(error) };
  f.security.reserve(USERNAME, SESSION_ID, oldSeat);
  f.security.reserve(USERNAME, SESSION_ID, newSeat);
  f.security.releaseSeat(SESSION_ID, oldSeat);
  f.security.revoke(SESSION_ID);
  assert.equal(f.rejections.length, 1);
  assert.equal(f.security.reserve(USERNAME, SESSION_ID, newSeat), false);
  assert.equal(f.rejections.length, 2);
});

test("reconnect account query failure denies access without querying membership", async () => {
  const failure = new Error("database unavailable");
  const denied = await readReconnectAccess(USERNAME, "token", OFFICE_ID, {
    account: async () => { throw failure; },
    officeRole: async () => { throw new Error("must not query membership after account failure"); },
  });
  assert.equal(denied.accountActive, false);
  assert.equal(denied.officeMember, false);
});

test("reconnect membership query failure denies access and uses freshly checked maintainer role", async () => {
  const failure = new Error("membership query unavailable");
  let maintainerFlag = false;
  const denied = await readReconnectAccess(USERNAME, "token", OFFICE_ID, {
    account: async () => ({ username: USERNAME, role: "maintainer" }),
    officeRole: async (_user, _office, maintainer) => { maintainerFlag = maintainer; throw failure; },
  });
  assert.equal(maintainerFlag, true);
  assert.equal(denied.accountActive, false);
  assert.equal(denied.officeMember, false);
  assert.equal(denied.error, failure);
});
