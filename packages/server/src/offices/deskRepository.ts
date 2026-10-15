import type { Pool, PoolClient } from "pg";
import { projectDeskOwners, readRoomLayout, type OfficeDesk, type RoomLayout } from "@gammyverse/shared";
import { database } from "../infra/db.js";

const ACCESS_DENIED_LABEL = "Office not found or access denied.";
const DESK_MISSING_LABEL = "This desk no longer exists.";
const DESK_STORAGE_REQUIRED_LABEL = "Office desks require PostgreSQL.";
const DESK_OWNER_REQUIRED_LABEL = "Only the desk owner can unclaim this desk.";
const DESK_CLAIM_REQUIRED_LABEL = "Claim this desk before returning to it.";
const DESK_ALREADY_CLAIMED_LABEL = "This desk has already been claimed.";
const DESK_ALREADY_OWNED_LABEL = "You already own a desk in this office.";
type Queryable = Pick<PoolClient, "query">;
type DeskRow = { id: string; office_id: string; zone_id: string; owner_username: string | null };
type MapRow = { config: unknown; config_version: number };
export async function assertDeskMembership(client: Queryable, officeId: string, username: string, maintainer = false, requireMapEditor = false) {
  const result = await client.query(
    `SELECT 1 FROM app_offices offices LEFT JOIN app_office_memberships members
     ON members.office_id = offices.id AND members.username = $2
     WHERE offices.id = $1 AND offices.archived_at IS NULL
       AND (offices.owner_username = $2 OR members.username IS NOT NULL OR $3::boolean)
       AND (NOT $4::boolean OR offices.owner_username = $2 OR members.role = 'admin')`, [officeId, username, maintainer, requireMapEditor]);
  if (!result.rowCount) throw new Error(ACCESS_DENIED_LABEL);
}
export async function readOfficeDesks(client: Queryable, officeId: string): Promise<OfficeDesk[]> {
  const result = await client.query<DeskRow>(
    "SELECT id, office_id, zone_id, owner_username FROM app_office_desks WHERE office_id = $1 AND retired_at IS NULL ORDER BY id", [officeId]);
  return result.rows.map(row => ({ id: row.id, officeId: row.office_id, zoneId: row.zone_id, ownerUsername: row.owner_username }));
}
export async function projectOfficeDeskConfig(client: Queryable, officeId: string, config: unknown) {
  return { version: 1, layout: projectDeskOwners(readRoomLayout(config), await readOfficeDesks(client, officeId)) };
}
export async function reconcileOfficeDesks(client: Queryable, officeId: string, layout: RoomLayout) {
  const zoneIds = layout.zones.filter(zone => zone.kind === "private").map(zone => zone.id);
  await client.query("UPDATE app_office_desks SET retired_at = now(), owner_username = NULL, updated_at = now() WHERE office_id = $1 AND retired_at IS NULL AND NOT (zone_id = ANY($2::text[]))", [officeId, zoneIds]);
  await client.query(`INSERT INTO app_office_desks(office_id, zone_id)
    SELECT $1, unnest($2::text[]) ON CONFLICT (office_id, zone_id) WHERE retired_at IS NULL DO NOTHING`, [officeId, zoneIds]);
  return projectDeskOwners(layout, await readOfficeDesks(client, officeId));
}
export async function persistDeskProjection(client: Queryable, officeId: string, config: unknown) {
  const { layout } = await projectOfficeDeskConfig(client, officeId, config);
  const updated = await client.query<MapRow>(`UPDATE app_office_map_layouts SET config = $2::jsonb,
    config_version = config_version + 1, updated_at = now() WHERE office_id = $1 RETURNING config, config_version`, [officeId, JSON.stringify({ version: 1, layout })]);
  return updated.rows[0]!;
}
export class DeskRepository {
  constructor(private readonly store: Pool | null = database) {}
  private storage() { if (!this.store) throw new Error(DESK_STORAGE_REQUIRED_LABEL); return this.store; }
  async list(username: string, officeId: string, maintainer = false) {
    const client = await this.storage().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT config_version FROM app_office_map_layouts WHERE office_id = $1 FOR SHARE", [officeId]);
      await assertDeskMembership(client, officeId, username, maintainer);
      const maps = await client.query<MapRow>("SELECT config_version FROM app_office_map_layouts WHERE office_id = $1", [officeId]);
      const desks = await readOfficeDesks(client, officeId);
      await client.query("COMMIT");
      return { desks, configVersion: maps.rows[0]?.config_version ?? 1 };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async change(username: string, officeId: string, identifier: { deskId: string } | { zoneId: string }, claim: boolean) {
    const client = await this.storage().connect();
    try {
      await client.query("BEGIN");
      const maps = await client.query<MapRow>("SELECT config, config_version FROM app_office_map_layouts WHERE office_id = $1 FOR UPDATE", [officeId]);
      await assertDeskMembership(client, officeId, username);
      if (!maps.rows[0]) throw new Error(DESK_MISSING_LABEL);
      const desks = await readOfficeDesks(client, officeId);
      const desk = desks.find(entry => "deskId" in identifier ? entry.id === identifier.deskId : entry.zoneId === identifier.zoneId);
      if (!desk) throw new Error(DESK_MISSING_LABEL);
      this.checkChange(desk, desks, username, claim);
      let map = maps.rows[0];
      const owner = claim ? username : null;
      if (desk.ownerUsername !== owner) {
        await client.query("UPDATE app_office_desks SET owner_username = $3, updated_at = now() WHERE office_id = $1 AND id = $2 AND retired_at IS NULL", [officeId, desk.id, owner]);
        map = await persistDeskProjection(client, officeId, map.config);
      }
      const currentDesks = await readOfficeDesks(client, officeId);
      await client.query("COMMIT");
      return { config: map.config, configVersion: map.config_version, desks: currentDesks };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  private checkChange(desk: OfficeDesk, desks: OfficeDesk[], username: string, claim: boolean) {
    if (!claim && desk.ownerUsername !== username) throw new Error(DESK_OWNER_REQUIRED_LABEL);
    if (!claim || desk.ownerUsername === username) return;
    if (desk.ownerUsername) throw new Error(DESK_ALREADY_CLAIMED_LABEL);
    if (desks.some(entry => entry.ownerUsername === username)) throw new Error(DESK_ALREADY_OWNED_LABEL);
  }
  async destination(username: string, officeId: string, deskId: string) {
    const client = await this.storage().connect();
    try {
      await client.query("BEGIN");
      const map = await client.query<MapRow>("SELECT config, config_version FROM app_office_map_layouts WHERE office_id = $1 FOR SHARE", [officeId]);
      await assertDeskMembership(client, officeId, username);
      const desk = (await readOfficeDesks(client, officeId)).find(entry => entry.id === deskId);
      if (!desk || !map.rows[0]) throw new Error(DESK_MISSING_LABEL);
      if (desk.ownerUsername !== username) throw new Error(DESK_CLAIM_REQUIRED_LABEL);
      const zone = readRoomLayout(map.rows[0].config).zones.find(entry => entry.kind === "private" && entry.id === desk.zoneId);
      if (!zone) throw new Error(DESK_MISSING_LABEL);
      await client.query("COMMIT");
      return { desk, zone };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
}
