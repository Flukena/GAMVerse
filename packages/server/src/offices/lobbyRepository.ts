import type { PoolClient } from "pg";
import { database } from "../infra/db.js";
import { lobbySearchPattern, type LobbyPageOptions } from "../infra/lobbyPagination.js";

export type LobbyListKind = "offices" | "invites" | "users" | "events";
export type LobbySession = { username: string; role: string };
export type LobbyPageResult = { items: Record<string, unknown>[]; total: number };
export type LobbyAuditFilters = { action?: string; targetType?: string; targetId?: string };

/** One statement keeps the matching count and page on the same PostgreSQL snapshot. */
export async function listLobbyPage(
  kind: LobbyListKind,
  session: LobbySession,
  options: LobbyPageOptions,
  filters: LobbyAuditFilters = {},
  store: Pick<PoolClient, "query"> | null = database,
): Promise<LobbyPageResult> {
  if (!store) return { items: [], total: 0 };
  const pattern = lobbySearchPattern(options.search);
  let source: string;
  let projection: string;
  let order: string;
  let values: unknown[];
  if (kind === "offices") {
    source = `SELECT offices.id, offices.name, offices.owner_username, memberships.role AS membership_role, offices.created_at
      FROM app_offices offices LEFT JOIN app_office_memberships memberships
        ON memberships.office_id = offices.id AND memberships.username = $1
      WHERE offices.archived_at IS NULL
        AND ($2::boolean OR offices.owner_username = $1 OR memberships.username IS NOT NULL)
        AND ($3::text IS NULL OR offices.name ILIKE $3 OR
          (CASE WHEN offices.owner_username LIKE 'former:%' THEN 'Former owner' ELSE offices.owner_username END) ILIKE $3)`;
    projection = `id, name, CASE WHEN owner_username LIKE 'former:%' THEN 'Former owner' ELSE owner_username END AS "ownerUsername",
      CASE WHEN $2::boolean THEN 'maintainer' WHEN owner_username = $1 THEN 'owner' ELSE COALESCE(membership_role, 'user') END AS role`;
    order = "created_at DESC, id DESC";
    values = [session.username, session.role === "maintainer", pattern];
  } else if (kind === "invites") {
    source = `SELECT invites.id, invites.office_id, offices.name AS office_name, invites.created_by, invites.role, invites.expires_at, invites.created_at
      FROM app_office_invites invites JOIN app_offices offices ON offices.id = invites.office_id
      WHERE invites.invited_username = $1 AND invites.accepted_at IS NULL AND invites.revoked_at IS NULL
        AND invites.expires_at > now() AND offices.archived_at IS NULL
        AND ($2::text IS NULL OR offices.name ILIKE $2 OR invites.created_by ILIKE $2 OR invites.role ILIKE $2)`;
    projection = `id, office_id AS "officeId", office_name AS "officeName", created_by AS inviter, role, expires_at AS "expiresAt"`;
    order = "created_at DESC, id DESC";
    values = [session.username, pattern];
  } else if (kind === "users") {
    source = `SELECT username, email, last_active_at, suspended_at, is_maintainer FROM app_users
      WHERE ($1::text IS NULL OR username ILIKE $1 OR email ILIKE $1
        OR (CASE WHEN is_maintainer THEN 'maintainer' ELSE 'user' END) ILIKE $1)`;
    projection = `username, email, last_active_at AS "lastActiveAt", suspended_at AS "suspendedAt",
      CASE WHEN is_maintainer THEN 'maintainer' ELSE 'user' END AS role`;
    order = "username ASC";
    values = [pattern];
  } else {
    source = `SELECT id, actor_username, action, target_type, target_id, metadata, occurred_at FROM app_maintainer_audit
      WHERE ($1::text IS NULL OR actor_username ILIKE $1 OR action ILIKE $1 OR target_type ILIKE $1 OR target_id ILIKE $1)
        AND ($2::text IS NULL OR action = $2) AND ($3::text IS NULL OR target_type = $3) AND ($4::text IS NULL OR target_id = $4)`;
    projection = `id::text, actor_username AS "actorUsername", action, target_type AS "targetType", target_id AS "targetId", metadata, occurred_at AS "occurredAt"`;
    order = "occurred_at DESC, id DESC";
    values = [pattern, filters.action?.trim().slice(0, 80) || null, filters.targetType?.trim().slice(0, 80) || null, filters.targetId?.trim().slice(0, 200) || null];
  }
  values.push(options.pageSize, options.offset);
  const result = await store.query<{ total: string | number; items: Record<string, unknown>[] }>(
    `WITH filtered AS (${source})
      SELECT (SELECT count(*) FROM filtered) AS total,
        COALESCE((SELECT json_agg(page_rows) FROM
          (SELECT ${projection} FROM filtered ORDER BY ${order} LIMIT $${values.length - 1} OFFSET $${values.length}) page_rows), '[]'::json) AS items`,
    values,
  );
  return { items: result.rows[0]?.items ?? [], total: Number(result.rows[0]?.total ?? 0) };
}
