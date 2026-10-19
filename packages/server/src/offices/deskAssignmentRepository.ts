import { tokenHash } from "../auth/service.js";
import type { Pool, PoolClient } from "pg";
import { OFFICE_DESK_ASSIGNMENT_MEMBERS_MAX_COUNT, readRoomLayout, type OfficeDeskAdministrationSnapshot, type OfficeDeskAssignmentCommand } from "@gammyverse/shared";
import { database } from "../infra/db.js";
import { persistDeskProjection, readOfficeDesks } from "./deskRepository.js";
import { DESK_ASSIGNMENT_CONFLICT_LABEL, DeskAssignmentError, planDeskAssignment, type DeskOwnerChange } from "./deskAssignments.js";

export const DESK_ASSIGNMENT_TRANSACTION_TIMEOUT_MS = 20_000;
const DESK_ASSIGNMENT_STATEMENT_TIMEOUT_MS = 5_000;
const ACCESS_DENIED_LABEL = "Desk administration is unavailable or access was denied.";
const MEMBER_LIMIT_EXCEEDED_LABEL = "This office exceeds the desk administration member limit.";
const STORAGE_REQUIRED_LABEL = "Desk administration requires PostgreSQL.";
const TARGET_UNAVAILABLE_LABEL = "This member is no longer eligible for a desk. Reload and try again.";
type MapRow = { config: unknown; config_version: number };
type UserRow = { username: string; nickname: string | null; is_maintainer: boolean; suspended_at: Date | null };
export type DeskAssignmentActor = { username: string; sessionToken: string };

export class DeskAssignmentTransaction {
  private commitAttempted = false;
  private completed = false;
  private constructor(private readonly client: PoolClient, readonly officeId: string,
    readonly map: MapRow, readonly members: { username: string; displayName: string }[]) {}

  static async open(store: Pool, officeId: string, actor: DeskAssignmentActor, write: boolean) {
    const client = await store.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('statement_timeout', $1, true), set_config('idle_in_transaction_session_timeout', $2, true)",
        [String(DESK_ASSIGNMENT_STATEMENT_TIMEOUT_MS), String(DESK_ASSIGNMENT_TRANSACTION_TIMEOUT_MS)]);
      const maps = await client.query<MapRow>(`SELECT config, config_version FROM app_office_map_layouts WHERE office_id = $1 FOR ${write ? "UPDATE" : "SHARE"}`, [officeId]);
      if (!maps.rows[0]) throw new DeskAssignmentError("forbidden", ACCESS_DENIED_LABEL);
      const members = await readAdministrationMembers(client, officeId, actor);
      return new DeskAssignmentTransaction(client, officeId, maps.rows[0], members);
    } catch (error) {
      try { await client.query("ROLLBACK"); } finally { client.release(); }
      throw error;
    }
  }

  async snapshot(): Promise<Omit<OfficeDeskAdministrationSnapshot, "realtimeSync">> {
    const layout = readRoomLayout(this.map.config);
    const desks = (await readOfficeDesks(this.client, this.officeId)).map(desk => {
      const zone = layout.zones.find(zone => zone.id === desk.zoneId && zone.kind === "private");
      if (!zone) throw new DeskAssignmentError("conflict", DESK_ASSIGNMENT_CONFLICT_LABEL);
      return { ...desk, name: zone.name };
    });
    return { officeId: this.officeId, configVersion: this.map.config_version, desks, members: this.members };
  }

  async plan(command: OfficeDeskAssignmentCommand): Promise<DeskOwnerChange[]> {
    if (command.expectedConfigVersion !== this.map.config_version)
      throw new DeskAssignmentError("conflict", DESK_ASSIGNMENT_CONFLICT_LABEL);
    const changes = planDeskAssignment(await readOfficeDesks(this.client, this.officeId), command);
    for (const change of changes) {
      if (change.ownerUsername && !this.members.some(member => member.username === change.ownerUsername))
        throw new DeskAssignmentError("conflict", TARGET_UNAVAILABLE_LABEL);
    }
    return changes;
  }

  async apply(changes: readonly DeskOwnerChange[]) {
    for (const change of changes) {
      const updated = await this.client.query(`UPDATE app_office_desks SET owner_username = $3, updated_at = now()
        WHERE office_id = $1 AND id = $2 AND retired_at IS NULL AND owner_username IS NOT DISTINCT FROM $4`,
        [this.officeId, change.desk.id, change.ownerUsername, change.desk.ownerUsername]);
      if (updated.rowCount !== 1) throw new DeskAssignmentError("conflict", DESK_ASSIGNMENT_CONFLICT_LABEL);
    }
    const map = await persistDeskProjection(this.client, this.officeId, this.map.config);
    const desks = await readOfficeDesks(this.client, this.officeId);
    return { config: map.config, configVersion: map.config_version, desks };
  }

  async commit() {
    this.commitAttempted = true;
    await this.client.query("COMMIT");
    this.completed = true;
  }

  async rollback(): Promise<boolean> {
    if (this.commitAttempted) return false;
    await this.client.query("ROLLBACK");
    this.completed = true;
    return true;
  }

  release() { this.client.release(!this.completed); }
}

async function readAdministrationMembers(client: PoolClient, officeId: string, actor: DeskAssignmentActor) {
  // Membership precedes office locking, matching role changes; all desk writers lock the map first.
  const memberships = await client.query<{ username: string; role: string }>(
    "SELECT username, role FROM app_office_memberships WHERE office_id = $1 ORDER BY username FOR SHARE", [officeId]);
  const users = await client.query<UserRow>(`SELECT username, nickname, is_maintainer, suspended_at FROM app_users
    WHERE username = $2 OR username IN (SELECT username FROM app_office_memberships WHERE office_id = $1)
      OR username IN (SELECT owner_username FROM app_offices WHERE id = $1)
    ORDER BY username FOR SHARE`, [officeId, actor.username]);
  const account = users.rows.find(user => user.username === actor.username && user.suspended_at === null);
  const sessions = await client.query(`SELECT 1 FROM app_sessions WHERE username = $1 AND token_hash = $2
    AND revoked_at IS NULL AND expires_at > now() FOR SHARE`,
    [actor.username, tokenHash(actor.sessionToken)]);
  const offices = await client.query<{ owner_username: string }>(
    "SELECT owner_username FROM app_offices WHERE id = $1 AND archived_at IS NULL FOR SHARE", [officeId]);
  const office = offices.rows[0];
  const role = memberships.rows.find(member => member.username === actor.username)?.role;
  if (!account || !sessions.rowCount || !office || !(account.is_maintainer || office.owner_username === actor.username || role === "admin"))
    throw new DeskAssignmentError("forbidden", ACCESS_DENIED_LABEL);
  const members = users.rows.filter(user => user.suspended_at === null && (user.username === office.owner_username || memberships.rows.some(member => member.username === user.username)))
    .map(user => ({ username: user.username, displayName: user.nickname?.trim() || user.username }));
  if (members.length > OFFICE_DESK_ASSIGNMENT_MEMBERS_MAX_COUNT)
    throw new DeskAssignmentError("unavailable", MEMBER_LIMIT_EXCEEDED_LABEL);
  return members;
}

export function deskAssignmentStorage(): Pool {
  if (!database) throw new DeskAssignmentError("unavailable", STORAGE_REQUIRED_LABEL);
  return database;
}
