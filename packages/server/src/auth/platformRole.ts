import { normalizeAccountUsername as normalizeUsername } from "@gammyverse/shared";
import type { Pool } from "pg";
import { database } from "../infra/db.js";
import { recordAuditEvent } from "../infra/audit.js";

/** Change platform access for another account and invalidate sessions using its previous role. */
export async function setAccountPlatformRole(
  actorValue: unknown,
  usernameValue: unknown,
  roleValue: unknown,
  roleDatabase: Pick<Pool, "connect"> | null = database,
) {
  const actor = normalizeUsername(actorValue);
  const username = normalizeUsername(usernameValue);
  if (!actor || !username) return { error: "Account not found." };
  if (actor === username) return { error: "You cannot change your own platform role." };
  if (roleValue !== "user" && roleValue !== "maintainer") return { error: "Platform role must be user or maintainer." };
  if (!roleDatabase) return { error: "Platform role changes require the PostgreSQL audit store." };

  const client = await roleDatabase.connect();
  try {
    await client.query("BEGIN");
    // Share the suspension lock so role changes cannot race with last-maintainer protection.
    await client.query("SELECT pg_advisory_xact_lock(724031106)");
    const target = await client.query<{ is_maintainer: boolean; suspended_at: Date | null }>(
      "SELECT is_maintainer, suspended_at FROM app_users WHERE username = $1 FOR UPDATE",
      [username],
    );
    const account = target.rows[0];
    if (!account) { await client.query("ROLLBACK"); return { error: "Account not found." }; }
    const currentRole = account.is_maintainer ? "maintainer" : "user";
    if (currentRole === roleValue) {
      await client.query("COMMIT");
      return { role: currentRole, changed: false };
    }
    if (currentRole === "maintainer" && roleValue === "user" && account.suspended_at === null) {
      const activeMaintainers = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM app_users WHERE is_maintainer = TRUE AND suspended_at IS NULL",
      );
      if (Number(activeMaintainers.rows[0]?.count ?? 0) <= 1) {
        await client.query("ROLLBACK");
        return { error: "The last active maintainer cannot be demoted." };
      }
    }
    await client.query("UPDATE app_users SET is_maintainer = $2 WHERE username = $1", [username, roleValue === "maintainer"]);
    await client.query("UPDATE app_sessions SET revoked_at = now() WHERE username = $1 AND revoked_at IS NULL", [username]);
    await recordAuditEvent(client, {
      actorUsername: actor,
      action: "account.role_changed",
      targetType: "account",
      targetId: username,
      metadata: { fromRole: currentRole, toRole: roleValue },
    });
    await client.query("COMMIT");
    return { role: roleValue, changed: true };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
