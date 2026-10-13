import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

const testDirectory = await mkdtemp(join(process.cwd(), ".test-gammyverse-auth-"));
process.env.AUTH_USERS_FILE = join(testDirectory, "users.json");
const { changeAccountPassword, getSession, listAccountsForMaintainer, loginAccount, markUserActive, pruneInactiveAccounts, registerAccount, revokeSession, setAccountSuspended } = await import("./auth/service.js");
const { OfficeRoom } = await import("./offices/OfficeRoom.js");
const room = new OfficeRoom();
const allowedTestOrigin = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173").split(",")[0];
const authContext = () => ({ headers: new Headers({ origin: allowedTestOrigin }), ip: "127.0.0.1" });
const password = "qa-only-passphrase-9381";
const username = `qa-${randomUUID().slice(0, 8)}`;

after(async () => {
  await rm(testDirectory, { recursive: true, force: true });
  delete process.env.AUTH_USERS_FILE;
});

test("registration, password login, and logout use server-owned sessions", async () => {
  await assert.rejects(() => room.onAuth({} as never, {}, authContext()), /Authentication required/);
  await assert.rejects(() => room.onAuth({} as never, {}, { headers: new Headers({ origin: "https://attacker.invalid" }), ip: "127.0.0.1" }), /Origin is not allowed/);
  const registration = await registerAccount(username, password, " QA.User@Example.COM ");
  assert.ok("sessionToken" in registration);
  if (!("sessionToken" in registration)) return;
  assert.deepEqual(registration.user, { username, nickname: null, role: "user", characterId: null });
  assert.deepEqual(await getSession(registration.sessionToken), { username, nickname: null, role: "user", characterId: null });

  const contents = await readFile(process.env.AUTH_USERS_FILE!, "utf8");
  assert.equal(contents.includes(password), false);
  const [storedAccount] = JSON.parse(contents) as Array<{ salt: string; passwordHash: string }>;
  assert.equal(storedAccount.salt.length, 32);
  assert.equal(storedAccount.passwordHash.length, 128);
  assert.equal((storedAccount as typeof storedAccount & { email?: string }).email, "qa.user@example.com");

  const login = await loginAccount(username.toUpperCase(), password);
  assert.ok("sessionToken" in login);
  if ("sessionToken" in login) assert.deepEqual(await getSession(login.sessionToken), { username, nickname: null, role: "user", characterId: null });
  const changed = await changeAccountPassword(username, password, "qa-new-passphrase-3819");
  assert.ok("sessionToken" in changed);
  if ("sessionToken" in changed) assert.equal(await getSession(changed.sessionToken) !== null, true);
  assert.equal(await getSession(registration.sessionToken), null);
  assert.ok("error" in await loginAccount(username, password));
  assert.ok("sessionToken" in await loginAccount(username, "qa-new-passphrase-3819"));
  const wrongPortal = await loginAccount(username, "qa-new-passphrase-3819", "maintainer");
  assert.ok("error" in wrongPortal);
  if ("error" in wrongPortal) assert.match(wrongPortal.error, /not a maintainer/);
  assert.ok("error" in await loginAccount(username, "wrong-passphrase"));
  assert.ok("error" in await registerAccount(username, password));

  if ("sessionToken" in login) {
    revokeSession(login.sessionToken);
    assert.equal(await getSession(login.sessionToken), null);
    await assert.rejects(() => room.onAuth({} as never, {}, authContext()), /Authentication required/);
  }

  await markUserActive(username, Date.now() + 2 * 24 * 60 * 60 * 1000);
  assert.deepEqual(await pruneInactiveAccounts(), []);
  assert.deepEqual(await pruneInactiveAccounts(Date.now() + 33 * 24 * 60 * 60 * 1000), [username]);
  assert.equal(await getSession(registration.sessionToken), null);
});

test("account suspension is audited and revokes sessions when available, otherwise fails closed", async () => {
  const target = `suspend-${randomUUID().slice(0, 8)}`;
  const created = await registerAccount(target, password);
  assert.ok("sessionToken" in created);
  if (!("sessionToken" in created)) return;

  const suspended = await setAccountSuspended("maintainer", target, true);
  if ("error" in suspended) {
    assert.match(suspended.error ?? "", /PostgreSQL audit store/i);
    assert.notEqual(await getSession(created.sessionToken), null);
    await revokeSession(created.sessionToken);
    return;
  }
  assert.equal(await getSession(created.sessionToken), null);
  const suspendedLogin = await loginAccount(target, password);
  assert.ok("error" in suspendedLogin);
  if ("error" in suspendedLogin) assert.match(suspendedLogin.error, /suspended/i);
  assert.equal(Boolean((await listAccountsForMaintainer()).find((account) => account.username === target)?.suspendedAt), true);
  const pruned = await pruneInactiveAccounts(Date.now() + 40 * 24 * 60 * 60 * 1000);
  assert.equal(pruned.includes(target), false);

  const reactivated = await setAccountSuspended("maintainer", target, false);
  assert.equal("error" in reactivated, false);
  assert.equal((await listAccountsForMaintainer()).find((account) => account.username === target)?.suspendedAt, null);
  assert.ok("sessionToken" in await loginAccount(target, password));
});
