import { tokenHash } from "../infra/tokenHash.js";
import { randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { isOfficeShareAcceptance, OFFICE_SHARE_LINK_TTL_DAYS } from "@gammyverse/shared";
import { database } from "../infra/db.js";

const SHARE_TOKEN_BYTES_COUNT = 32;
const INVALID_LINK_LABEL = "Share link is invalid or expired.";
const ACCESS_DENIED_LABEL = "Office share link access denied.";
const USER_ROLE_LABEL = "user";
type LinkRow = { id: string; created_at: Date; expires_at: Date };
const summary = (row: LinkRow) => ({ id: row.id, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString() });

export class OfficeShareLinks {
  constructor(private readonly store: Pool | null = database) {}

  private async transaction<T>(action: (client: PoolClient) => Promise<T>) {
    if (!this.store) throw new Error("Office share links require PostgreSQL.");
    const client = await this.store.connect();
    try {
      await client.query("BEGIN");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  private async authorize(client: PoolClient, actor: string, officeId: string) {
    // Resolve platform and office roles from current database state, never request fields.
    const result = await client.query(
      `SELECT offices.id FROM app_offices offices JOIN app_users users ON users.username = $2
       LEFT JOIN app_office_memberships members ON members.office_id = offices.id AND members.username = users.username
       WHERE offices.id = $1 AND offices.archived_at IS NULL AND users.suspended_at IS NULL
       AND (users.is_maintainer OR offices.owner_username = users.username OR members.role = 'admin')
       FOR UPDATE OF offices FOR SHARE OF users`, [officeId, actor]);
    if (!result.rowCount) throw new Error(ACCESS_DENIED_LABEL);
  }

  create(actor: string, officeId: string) {
    return this.transaction(async client => {
      await this.authorize(client, actor, officeId);
      const token = randomBytes(SHARE_TOKEN_BYTES_COUNT).toString("base64url");
      const result = await client.query<LinkRow>(
        `INSERT INTO app_office_share_links(id, office_id, token_hash, created_by, expires_at)
         VALUES ($1, $2, $3, $4, now() + $5 * interval '1 day') RETURNING id, created_at, expires_at`,
        [randomUUID(), officeId, tokenHash(token), actor, OFFICE_SHARE_LINK_TTL_DAYS]);
      return { ...summary(result.rows[0]), token };
    });
  }

  list(actor: string, officeId: string) {
    return this.transaction(async client => {
      await this.authorize(client, actor, officeId);
      const result = await client.query<LinkRow>(
        `SELECT id, created_at, expires_at FROM app_office_share_links
         WHERE office_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC`, [officeId]);
      return result.rows.map(summary);
    });
  }

  revoke(actor: string, officeId: string, linkId: string) {
    return this.transaction(async client => {
      await this.authorize(client, actor, officeId);
      await client.query("UPDATE app_office_share_links SET revoked_at = now() WHERE office_id = $1 AND id = $2", [officeId, linkId]);
    });
  }

  accept(username: string, payload: unknown) {
    if (!isOfficeShareAcceptance(payload)) return Promise.reject(new Error(INVALID_LINK_LABEL));
    return this.transaction(async client => {
      // All paths lock the office before the link, including revocation.
      const officeResult = await client.query<{ office_id: string }>(
        `SELECT offices.id AS office_id FROM app_offices offices
         JOIN app_office_share_links links ON links.office_id = offices.id
         JOIN app_users users ON users.username = $2
         WHERE links.token_hash = $1 AND offices.archived_at IS NULL AND users.suspended_at IS NULL
         FOR UPDATE OF offices FOR SHARE OF users`, [tokenHash(payload.token), username]);
      const officeId = officeResult.rows[0]?.office_id;
      if (!officeId) throw new Error(INVALID_LINK_LABEL);
      const linkResult = await client.query<{ office_id: string; created_by: string }>(
        `SELECT office_id, created_by FROM app_office_share_links
         WHERE token_hash = $1 AND office_id = $2 AND revoked_at IS NULL AND expires_at > clock_timestamp()
         FOR UPDATE`, [tokenHash(payload.token), officeId]);
      const link = linkResult.rows[0];
      if (!link) throw new Error(INVALID_LINK_LABEL);
      await client.query(
        `INSERT INTO app_office_memberships(office_id, username, role, added_by)
         SELECT id, $2::varchar, $3::varchar, $4::varchar FROM app_offices WHERE id = $1 AND owner_username <> $2::varchar
         ON CONFLICT (office_id, username) DO NOTHING`, [link.office_id, username, USER_ROLE_LABEL, link.created_by]);
      await client.query("UPDATE app_offices SET last_activity_at = now() WHERE id = $1", [link.office_id]);
      return link.office_id;
    });
  }
}
