import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

const testDirectory = await mkdtemp(join(process.cwd(), ".test-gammyverse-auth-"));
process.env.AUTH_USERS_FILE = join(testDirectory, "users.json");
const { changeAccountPassword, getSession, loginAccount, markUserActive, pruneInactiveAccounts, registerAccount, revokeSession } = await import("./auth/service.js");
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
  assert.deepEqual(registration.user, { username, role: "user", characterId: null });
  assert.deepEqual(await getSession(registration.sessionToken), { username, role: "user", characterId: null });

  const contents = await readFile(process.env.AUTH_USERS_FILE!, "utf8");
  assert.equal(contents.includes(password), false);
  const [storedAccount] = JSON.parse(contents) as Array<{ salt: string; passwordHash: string }>;
  assert.equal(storedAccount.salt.length, 32);
  assert.equal(storedAccount.passwordHash.length, 128);
  assert.equal((storedAccount as typeof storedAccount & { email?: string }).email, "qa.user@example.com");

  const login = await loginAccount(username.toUpperCase(), password);
  assert.ok("sessionToken" in login);
  if ("sessionToken" in login) assert.deepEqual(await getSession(login.sessionToken), { username, role: "user", characterId: null });
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
