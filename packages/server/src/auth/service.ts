import { normalizeAccountUsername as normalizeUsername } from "@gammyverse/shared";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { database } from "../infra/db.js";
import { recordAuditEvent } from "../infra/audit.js";
import { DEFAULT_CHARACTER_ID, KENNEY_CHARACTER_IDS, type KenneyCharacterId } from "@gammyverse/shared";
import { isCustomCharacterId, userOwnsCharacterModel } from "./characterModels.js";

const scrypt = promisify(scryptCallback);
const usersFile = process.env.AUTH_USERS_FILE ?? join(process.cwd(), "data", "auth-users.json");
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const inactivityLimitMs = 30 * 24 * 60 * 60 * 1000;
const activityWriteIntervalMs = 24 * 60 * 60 * 1000;
const sessions = new Map<string, { username: string; role: PlatformRole; expiresAt: number }>();
const lastActivityWriteAt = new Map<string, number>();
export type PlatformRole = "maintainer" | "user";
type UserRecord = { username: string; salt: string; passwordHash: string; createdAt: string; lastActiveAt?: string; isMaintainer?: boolean; email?: string | null; characterId?: string | null; nickname?: string | null; suspendedAt?: string | null };
let userRecordsPromise: Promise<UserRecord[]> | undefined;
let writeQueue = Promise.resolve();

async function users(): Promise<UserRecord[]> {
  userRecordsPromise ??= readFile(usersFile, "utf8")
    .then((contents) => JSON.parse(contents) as UserRecord[])
    .catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      await mkdir(dirname(usersFile), { recursive: true });
      return [];
    });
  return userRecordsPromise;
}



function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

async function hashPassword(password: string, salt: string): Promise<Buffer> {
  return await scrypt(password, salt, 64) as Buffer;
}

async function saveUsers(records: UserRecord[]) {
  await mkdir(dirname(usersFile), { recursive: true });
  const temporaryFile = `${usersFile}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(records, null, 2), { mode: 0o600 });
  await rename(temporaryFile, usersFile);
  userRecordsPromise = Promise.resolve(records);
}

function enqueueUserWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeCharacterId(characterId: string | null | undefined) {
  if (characterId == null) return null;
  if (isCustomCharacterId(characterId)) return characterId;
  return KENNEY_CHARACTER_IDS.includes(characterId as KenneyCharacterId) ? characterId : DEFAULT_CHARACTER_ID;
}

async function issueSession(username: string, role: PlatformRole, characterId: string | null = DEFAULT_CHARACTER_ID, nickname: string | null = null) {
  const sessionToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionTtlMs);
  if (database) {
    await database.query(
      "INSERT INTO app_sessions(username, token_hash, expires_at) VALUES ($1, $2, $3)",
      [username, tokenHash(sessionToken), expiresAt],
    );
  } else {
    sessions.set(sessionToken, { username, role, expiresAt: expiresAt.getTime() });
  }
  return { sessionToken, user: { username, nickname, role, characterId: normalizeCharacterId(characterId) } };
}

function normalizeEmail(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : undefined;
}

export async function registerAccount(usernameValue: unknown, passwordValue: unknown, emailValue?: unknown) {
  const username = normalizeUsername(usernameValue);
  if (!username) return { error: "Username must be 3–24 characters: letters, numbers, dot, dash or underscore." };
  if (!validPassword(passwordValue)) return { error: "Password must be between 8 and 128 characters." };
  const email = normalizeEmail(emailValue);
  if (email === undefined) return { error: "Enter a valid email address or leave it blank." };

  const salt = randomBytes(16).toString("hex");
  const passwordHash = (await hashPassword(passwordValue, salt)).toString("hex");
  const now = new Date();
  if (database) {
    try {
      await database.query(
        "INSERT INTO app_users(username, password_salt, password_hash, created_at, last_active_at, email, character_id) VALUES ($1, $2, $3, $4, $4, $5, NULL)",
        [username, salt, passwordHash, now, email],
      );
    } catch (error) {
      if ((error as { code?: string; constraint?: string }).code === "23505") return { error: (error as { constraint?: string }).constraint === "app_users_email_unique" ? "That email is already in use." : "That username is already taken." };
      throw error;
    }
  } else {
    return enqueueUserWrite(async () => {
      const records = await users();
      if (records.some((record) => record.username === username)) return { error: "That username is already taken." };
      records.push({ username, salt, passwordHash, createdAt: now.toISOString(), lastActiveAt: now.toISOString(), email, characterId: null });
      await saveUsers(records);
      lastActivityWriteAt.set(username, now.getTime());
      return issueSession(username, "user", null);
    });
  }
  lastActivityWriteAt.set(username, now.getTime());
  return issueSession(username, "user", null);
}

export async function loginAccount(usernameValue: unknown, passwordValue: unknown, portal: "user" | "maintainer" = "user") {
  const username = normalizeUsername(usernameValue);
  if (!username || !validPassword(passwordValue)) return { error: "Username or password is incorrect." };
  const record = database
    ? (await database.query<UserRecord>(
      "SELECT username, nickname, password_salt AS salt, password_hash AS \"passwordHash\", created_at AS \"createdAt\", last_active_at AS \"lastActiveAt\", is_maintainer AS \"isMaintainer\", COALESCE('custom-' || custom_character_model_id::text, character_id) AS \"characterId\", suspended_at AS \"suspendedAt\" FROM app_users WHERE username = $1",
      [username],
    )).rows[0]
    : (await users()).find((item) => item.username === username);
  if (!record) return { error: "Username or password is incorrect." };
  if (record.suspendedAt) return { error: "This account is suspended. Contact a maintainer." };
  const submitted = await hashPassword(passwordValue, record.salt);
  const expected = Buffer.from(record.passwordHash, "hex");
  if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
    return { error: "Username or password is incorrect." };
  }
  const role: PlatformRole = record.isMaintainer ? "maintainer" : "user";
  if (role !== portal) return { error: portal === "maintainer" ? "This account is not a maintainer account." : "Use the maintainer sign-in page for this account." };
  await markUserActive(username);
  return issueSession(username, role, record.characterId === undefined ? DEFAULT_CHARACTER_ID : record.characterId, record.nickname ?? null);
}

export async function changeAccountPassword(usernameValue: unknown, currentPassword: unknown, newPassword: unknown) {
  const username = normalizeUsername(usernameValue);
  if (!username || !validPassword(currentPassword)) return { error: "Current password is incorrect." };
  if (!validPassword(newPassword)) return { error: "New password must be between 8 and 128 characters." };
  const record = database
    ? (await database.query<UserRecord>("SELECT username, nickname, is_maintainer AS \"isMaintainer\", password_salt AS salt, password_hash AS \"passwordHash\", COALESCE('custom-' || custom_character_model_id::text, character_id) AS \"characterId\" FROM app_users WHERE username = $1", [username])).rows[0]
    : (await users()).find((item) => item.username === username);
  if (!record) return { error: "Current password is incorrect." };
  const submitted = await hashPassword(currentPassword, record.salt);
  const expected = Buffer.from(record.passwordHash, "hex");
  if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) return { error: "Current password is incorrect." };
  const salt = randomBytes(16).toString("hex");
  const passwordHash = (await hashPassword(newPassword, salt)).toString("hex");
  if (database) {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE app_users SET password_salt = $2, password_hash = $3 WHERE username = $1", [username, salt, passwordHash]);
      await client.query("UPDATE app_sessions SET revoked_at = now() WHERE username = $1 AND revoked_at IS NULL", [username]);
      await client.query("UPDATE app_password_resets SET revoked_at = now() WHERE username = $1 AND used_at IS NULL AND revoked_at IS NULL", [username]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } else {
    await enqueueUserWrite(async () => {
      const records = await users();
      const user = records.find((item) => item.username === username);
      if (!user) throw new Error("Account no longer exists.");
      user.salt = salt; user.passwordHash = passwordHash;
      await saveUsers(records);
      for (const [token, session] of sessions) if (session.username === username) sessions.delete(token);
    });
  }
  return issueSession(username, database ? (record.isMaintainer ? "maintainer" : "user") : "user", record.characterId === undefined ? DEFAULT_CHARACTER_ID : record.characterId, record.nickname ?? null);
}

export async function listAccountsForMaintainer() {
  if (!database) return (await users()).map(({ username, email = null, lastActiveAt = null, suspendedAt = null }) => ({ username, email, lastActiveAt, suspendedAt }));
  const result = await database.query<{ username: string; email: string | null; lastActiveAt: string | null; suspendedAt: string | null }>(
    'SELECT username, email, last_active_at AS "lastActiveAt", suspended_at AS "suspendedAt" FROM app_users ORDER BY username',
  );
  return result.rows;
}

/** Suspend or reactivate an account without deleting it. Suspension revokes every session. */
export async function setAccountSuspended(actorValue: unknown, usernameValue: unknown, suspended: unknown) {
  const actor = normalizeUsername(actorValue);
  const username = normalizeUsername(usernameValue);
  if (!actor || !username) return { error: "Account not found." };
  if (typeof suspended !== "boolean") return { error: "Suspension status must be true or false." };
  if (suspended && actor === username) return { error: "You cannot suspend your own account." };
  if (!database) return { error: "Account suspension requires the PostgreSQL audit store." };

  const client = await database.connect();
  try {
      await client.query("BEGIN");
      // Serialize maintainer suspension decisions so concurrent requests cannot suspend the final maintainer.
      await client.query("SELECT pg_advisory_xact_lock(724031106)");
      const target = await client.query<{ is_maintainer: boolean; suspended_at: Date | null }>(
        "SELECT is_maintainer, suspended_at FROM app_users WHERE username = $1 FOR UPDATE",
        [username],
      );
      const account = target.rows[0];
      if (!account) { await client.query("ROLLBACK"); return { error: "Account not found." }; }
      const currentlySuspended = account.suspended_at !== null;
      if (currentlySuspended === suspended) { await client.query("COMMIT"); return { suspendedAt: account.suspended_at?.toISOString() ?? null }; }
      if (suspended && account.is_maintainer) {
        const activeMaintainers = await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM app_users WHERE is_maintainer = TRUE AND suspended_at IS NULL",
        );
        if (Number(activeMaintainers.rows[0]?.count ?? 0) <= 1) {
          await client.query("ROLLBACK");
          return { error: "The last active maintainer cannot be suspended." };
        }
      }
      const updated = await client.query<{ suspended_at: Date | null }>(
        "UPDATE app_users SET suspended_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE username = $1 RETURNING suspended_at",
        [username, suspended],
      );
      if (suspended) {
        await client.query("UPDATE app_sessions SET revoked_at = now() WHERE username = $1 AND revoked_at IS NULL", [username]);
      }
      await recordAuditEvent(client, {
        actorUsername: actor,
        action: suspended ? "account.suspended" : "account.reactivated",
        targetType: "account",
        targetId: username,
      });
      await client.query("COMMIT");
      return { suspendedAt: updated.rows[0]?.suspended_at?.toISOString() ?? null };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function createPasswordResetLink(actorValue: unknown, usernameValue: unknown) {
  if (!database) return { error: "Password reset links require the PostgreSQL database." };
  const actor = normalizeUsername(actorValue);
  const username = normalizeUsername(usernameValue);
  if (!actor || !username) return { error: "Account not found." };
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query("SELECT 1 FROM app_users WHERE username = $1", [username]);
    if (!target.rowCount) { await client.query("ROLLBACK"); return { error: "Account not found." }; }
    await client.query("UPDATE app_password_resets SET revoked_at = now() WHERE username = $1 AND used_at IS NULL AND revoked_at IS NULL", [username]);
    await client.query("INSERT INTO app_password_resets(username, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4)", [username, tokenHash(token), actor, expiresAt]);
    await recordAuditEvent(client, { actorUsername: actor, action: "password_reset.issued", targetType: "account", targetId: username });
    await client.query("COMMIT");
    return { token, expiresAt: expiresAt.toISOString() };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function completePasswordReset(tokenValue: unknown, newPassword: unknown) {
  if (!database) return { error: "Password reset requires the PostgreSQL database." };
  if (typeof tokenValue !== "string" || !/^[A-Za-z0-9_-]{30,100}$/.test(tokenValue)) return { error: "This reset link is invalid or expired." };
  if (!validPassword(newPassword)) return { error: "New password must be between 8 and 128 characters." };
  const salt = randomBytes(16).toString("hex");
  const passwordHash = (await hashPassword(newPassword, salt)).toString("hex");
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const reset = await client.query<{ username: string }>("SELECT username FROM app_password_resets WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now() FOR UPDATE", [tokenHash(tokenValue)]);
    if (!reset.rows[0]) { await client.query("ROLLBACK"); return { error: "This reset link is invalid or expired." }; }
    const username = reset.rows[0].username;
    await client.query("UPDATE app_users SET password_salt = $2, password_hash = $3 WHERE username = $1", [username, salt, passwordHash]);
    await client.query("UPDATE app_password_resets SET used_at = now() WHERE token_hash = $1", [tokenHash(tokenValue)]);
    await client.query("UPDATE app_password_resets SET revoked_at = now() WHERE username = $1 AND used_at IS NULL AND revoked_at IS NULL", [username]);
    await client.query("UPDATE app_sessions SET revoked_at = now() WHERE username = $1 AND revoked_at IS NULL", [username]);
    await client.query("COMMIT");
    return { username };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function markUserActive(usernameValue: unknown, now = Date.now()) {
  if (typeof usernameValue !== "string") return;
  const username = usernameValue;
  if (now - (lastActivityWriteAt.get(username) ?? 0) < activityWriteIntervalMs) return;
  lastActivityWriteAt.set(username, now);
  if (database) {
    await database.query("UPDATE app_users SET last_active_at = $2 WHERE username = $1", [username, new Date(now)]);
    return;
  }
  await enqueueUserWrite(async () => {
    const records = await users();
    const record = records.find((item) => item.username === username);
    if (record) {
      record.lastActiveAt = new Date(now).toISOString();
      await saveUsers(records);
    }
  });
}

export async function pruneInactiveAccounts(now = Date.now()) {
  const cutoff = new Date(now - inactivityLimitMs);
  if (database) {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const staleOwners = await client.query<{ office_id: string; username: string; next_admin: string | null }>(
        `SELECT offices.id AS office_id, offices.owner_username AS username,
          (SELECT memberships.username FROM app_office_memberships memberships
            JOIN app_users admins ON admins.username = memberships.username
            WHERE memberships.office_id = offices.id AND memberships.role = 'admin'
              AND admins.last_active_at >= $1
            ORDER BY memberships.joined_at ASC, memberships.username ASC LIMIT 1) AS next_admin
        FROM app_offices offices JOIN app_users users ON users.username = offices.owner_username
        WHERE users.last_active_at < $1 AND users.suspended_at IS NULL AND offices.archived_at IS NULL
        ORDER BY offices.id FOR UPDATE OF offices, users`,
        [cutoff],
      );
      for (const office of staleOwners.rows) {
        const nextOwner = office.next_admin ?? `former:${randomBytes(16).toString("hex")}`;
        await client.query("UPDATE app_offices SET owner_username = $2 WHERE id = $1", [office.office_id, nextOwner]);
      }
      const deleted = await client.query<{ username: string }>(
        "DELETE FROM app_users WHERE last_active_at < $1 AND suspended_at IS NULL RETURNING username",
        [cutoff],
      );
      await client.query("DELETE FROM app_sessions WHERE expires_at < now() OR revoked_at < now() - interval '30 days'");
      await client.query("COMMIT");
      for (const { username } of deleted.rows) lastActivityWriteAt.delete(username);
      return deleted.rows.map(({ username }) => username);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return enqueueUserWrite(async () => {
    const records = await users();
    const deleted = records.filter((record) => {
      const lastActiveAt = Date.parse(record.lastActiveAt ?? record.createdAt);
      return !record.suspendedAt && (!Number.isFinite(lastActiveAt) || lastActiveAt < cutoff.getTime());
    });
    if (deleted.length === 0) return [];
    const deletedUsernames = new Set(deleted.map((record) => record.username));
    await saveUsers(records.filter((record) => !deletedUsernames.has(record.username)));
    for (const username of deletedUsernames) {
      lastActivityWriteAt.delete(username);
      for (const [token, session] of sessions) if (session.username === username) sessions.delete(token);
    }
    return [...deletedUsernames];
  });
}

export async function getSession(value: unknown) {
  if (typeof value !== "string") return null;
  if (database) {
    const result = await database.query<{ username: string; nickname: string | null; is_maintainer: boolean; character_id: string | null }>(
      "SELECT users.username, users.nickname, users.is_maintainer, COALESCE('custom-' || users.custom_character_model_id::text, users.character_id) AS character_id FROM app_sessions sessions JOIN app_users users USING (username) WHERE sessions.token_hash = $1 AND sessions.revoked_at IS NULL AND sessions.expires_at > now() AND users.suspended_at IS NULL",
      [tokenHash(value)],
    );
    const user = result.rows[0];
    return user ? { username: user.username, nickname: user.nickname, role: user.is_maintainer ? "maintainer" as const : "user" as const, characterId: normalizeCharacterId(user.character_id) } : null;
  }
  const session = sessions.get(value);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(value);
    return null;
  }
  const record = (await users()).find((item) => item.username === session.username);
  if (!record || record.suspendedAt) return null;
  return { username: session.username, nickname: record.nickname ?? null, role: session.role, characterId: normalizeCharacterId(record.characterId === undefined ? DEFAULT_CHARACTER_ID : record.characterId) };
}

function normalizeNickname(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const nickname = value.trim();
  if (!nickname) return null;
  return nickname.length <= 32 && !/[\u0000-\u001f\u007f]/.test(nickname) ? nickname : undefined;
}

export async function updateAccountNickname(usernameValue: unknown, nicknameValue: unknown) {
  const username = normalizeUsername(usernameValue);
  const nickname = normalizeNickname(nicknameValue);
  if (!username) return { error: "Account not found." };
  if (nickname === undefined) return { error: "Nickname must be 1–32 characters and cannot contain control characters." };
  if (database) {
    const result = await database.query("UPDATE app_users SET nickname = $2 WHERE username = $1", [username, nickname]);
    if (!result.rowCount) return { error: "Account not found." };
  } else {
    return enqueueUserWrite(async () => {
      const records = await users();
      const record = records.find((item) => item.username === username);
      if (!record) return { error: "Account not found." };
      record.nickname = nickname;
      await saveUsers(records);
      return { nickname };
    });
  }
  return { nickname };
}

export async function getAccountNickname(usernameValue: unknown) {
  const username = normalizeUsername(usernameValue);
  if (!username) return null;
  if (database) {
    const result = await database.query<{ nickname: string | null }>("SELECT nickname FROM app_users WHERE username = $1", [username]);
    return result.rows[0]?.nickname ?? null;
  }
  return (await users()).find((record) => record.username === username)?.nickname ?? null;
}

export async function updateAccountCharacter(usernameValue: unknown, characterValue: unknown) {
  const username = normalizeUsername(usernameValue);
  const isPreset = typeof characterValue === "string" && KENNEY_CHARACTER_IDS.includes(characterValue as KenneyCharacterId);
  const isCustom = isCustomCharacterId(characterValue);
  if (!username || (!isPreset && !isCustom)) {
    return { error: "Choose a character from the available collection." };
  }
  const characterId = characterValue as string;
  if (isCustom && !(await userOwnsCharacterModel(username, characterId))) return { error: "That custom model belongs to another account or no longer exists." };
  if (database) {
    const result = await database.query("UPDATE app_users SET character_id = CASE WHEN $2 THEN character_id ELSE $3 END, custom_character_model_id = CASE WHEN $2 THEN $4::uuid ELSE NULL END WHERE username = $1", [username, isCustom, isPreset ? characterId : DEFAULT_CHARACTER_ID, isCustom ? characterId.slice("custom-".length) : null]);
    if (!result.rowCount) return { error: "Account not found." };
  } else {
    return enqueueUserWrite(async () => {
      const records = await users();
      const record = records.find((item) => item.username === username);
      if (!record) return { error: "Account not found." };
      record.characterId = characterId;
      await saveUsers(records);
      return { characterId };
    });
  }
  return { characterId };
}

export async function revokeSession(value: unknown) {
  if (typeof value !== "string") return;
  if (database) {
    await database.query("UPDATE app_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [tokenHash(value)]);
  } else {
    sessions.delete(value);
  }
}
