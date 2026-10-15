import type { PoolClient } from "pg";
import { database } from "./db.js";

const MAX_AUDIT_EVENTS = 10_000;
const MAX_AUDIT_PAGE_SIZE = 200;

export type AuditMetadata = Record<string, string | number | boolean | null>;
type AuditQueryable = Pick<PoolClient, "query">;
export type MaintainerAuditEvent = {
  id: string;
  actorUsername: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: AuditMetadata;
  occurredAt: string;
};

const AUDIT_METADATA_ALLOWLIST: Record<string, readonly string[]> = {
  "office_invite.issued": ["role", "inviteType"],
  "office_member.role_changed": ["officeId", "fromRole", "toRole"],
  "office_member.removed": ["officeId", "previousRole"],
  "account.suspended": [],
  "account.reactivated": [],
  "account.role_changed": ["fromRole", "toRole"],
};

function allowlistedMetadata(action: string, metadata: AuditMetadata = {}): AuditMetadata {
  const allowedKeys = AUDIT_METADATA_ALLOWLIST[action] ?? [];
  const allowed: AuditMetadata = {};
  for (const key of allowedKeys) {
    const value = metadata[key];
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) allowed[key] = value;
    else if (typeof value === "string") allowed[key] = value.slice(0, 200);
  }
  return allowed;
}

export function normalizeMaintainerAuditOptions(options: {
  limit?: number;
  offset?: number;
  action?: string;
  targetType?: string;
  targetId?: string;
} = {}) {
  const limit = typeof options.limit === "number" && Number.isFinite(options.limit)
    ? Math.max(1, Math.min(MAX_AUDIT_PAGE_SIZE, Math.floor(options.limit)))
    : 50;
  const offset = typeof options.offset === "number" && Number.isFinite(options.offset)
    ? Math.max(0, Math.min(9_999, Math.floor(options.offset)))
    : 0;
  return {
    limit,
    offset,
    action: options.action?.trim().slice(0, 80) || null,
    targetType: options.targetType?.trim().slice(0, 80) || null,
    targetId: options.targetId?.trim().slice(0, 200) || null,
  };
}

/** Records only caller-constructed, allowlisted metadata. Never pass request bodies or credentials. */
export async function recordAuditEvent(
  queryable: PoolClient,
  event: { actorUsername: string; action: string; targetType: string; targetId: string; metadata?: AuditMetadata },
) {
  const metadata = allowlistedMetadata(event.action, event.metadata);
  await queryable.query(
    `INSERT INTO app_maintainer_audit(actor_username, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [event.actorUsername, event.action, event.targetType, event.targetId, JSON.stringify(metadata)],
  );
  // Keep the operational trail bounded while preserving the newest events.
  await queryable.query(
    `DELETE FROM app_maintainer_audit
     WHERE id NOT IN (
       SELECT id FROM app_maintainer_audit ORDER BY occurred_at DESC, id DESC LIMIT $1
     )`,
    [MAX_AUDIT_EVENTS],
  );
}

export async function listMaintainerAuditEvents(options: {
  limit?: number;
  offset?: number;
  action?: string;
  targetType?: string;
  targetId?: string;
} = {}, queryable: AuditQueryable | null = database): Promise<MaintainerAuditEvent[]> {
  if (!queryable) return [];
  const { limit, offset, action, targetType, targetId } = normalizeMaintainerAuditOptions(options);
  const result = await queryable.query<{
    id: string;
    actor_username: string;
    action: string;
    target_type: string;
    target_id: string;
    metadata: AuditMetadata;
    occurred_at: Date;
  }>(
    `SELECT id::text, actor_username, action, target_type, target_id, metadata, occurred_at
     FROM app_maintainer_audit
     WHERE ($1::text IS NULL OR action = $1)
       AND ($2::text IS NULL OR target_type = $2)
       AND ($3::text IS NULL OR target_id = $3)
     ORDER BY occurred_at DESC, id DESC
     LIMIT $4 OFFSET $5`,
    [action, targetType, targetId, limit, offset],
  );
  return result.rows.map((row) => ({
    id: row.id,
    actorUsername: row.actor_username,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata,
    occurredAt: row.occurred_at.toISOString(),
  }));
}
