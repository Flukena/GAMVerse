import { tokenHash } from "../infra/tokenHash.js";
import { DeskRepository, projectOfficeDeskConfig, reconcileOfficeDesks, persistDeskProjection, assertDeskMembership } from "./deskRepository.js";
import type { Pool } from "pg";
import { database } from "../infra/db.js";
import { recordAuditEvent } from "../infra/audit.js";
import { randomBytes } from "node:crypto";
import { MAX_OFFICE_PROPS } from "./limits.js";
import { campusWorldFromConfig, isPositionWalkable, isValidPropInteraction, readRoomLayout, roomPropPlacementSupport, roomZoneEntranceIssues, ROOM_DOOR_FRAME_ASSETS, ROOM_PROP_CATALOG, ROOM_WALL_MODEL_ASSETS, type OfficePropsSnapshot, type RoomLayout, type RoomLayoutProp } from "@gammyverse/shared";

export type OfficePersistenceDependencies = {
  store: Pool | null;
  role: (username: string, officeId: string, isMaintainer: boolean) => Promise<string | null>;
};
const officePersistenceDependencies = (): OfficePersistenceDependencies => ({ store: database, role: getOfficeRole });

export const EMPTY_OFFICE_MAP = { version: 1, layout: { version: 1, props: [], zones: [], walls: [], doors: [] } } as const;

export type OfficeRole = "owner" | "admin" | "user" | "maintainer";
export type OfficeSummary = { id: string; name: string; ownerUsername: string; role: OfficeRole };
export type OfficeInviteSummary = { id: string; officeId: string; officeName: string; inviter: string; role: "admin" | "user"; expiresAt: string };

export class OfficePropsVersionConflict extends Error {
  constructor(readonly latest: OfficePropsSnapshot) {
    super("Office props changed since you opened the editor.");
    this.name = "OfficePropsVersionConflict";
  }
}

export class OfficeMapVersionConflict extends Error {
  constructor(readonly latest: { config: unknown; configVersion: number }) {
    super("The office map changed since you opened the editor. Reload the map before saving your changes.");
    this.name = "OfficeMapVersionConflict";
  }
}

function mergeOfficeProps(configValue: unknown, props: RoomLayoutProp[]) {
  const config = typeof configValue === "object" && configValue !== null ? configValue as Record<string, unknown> : {};
  const currentLayout = readRoomLayout(configValue);
  return { ...config, version: 1, layout: { ...currentLayout, props } };
}

export async function getOfficeProps(username: string, officeId: string, isMaintainer = false): Promise<OfficePropsSnapshot> {
  if (!database) throw new Error("Office props require PostgreSQL.");
  const role = await getOfficeRole(username, officeId, isMaintainer);
  if (!role) throw new Error("Office not found or access denied.");
  const result = await database.query<{ props: unknown; config_version: number }>(
    "SELECT props, config_version FROM app_office_props WHERE office_id = $1", [officeId],
  );
  if (result.rows[0]) {
    const parsed = readRoomLayout({ layout: { props: result.rows[0].props } }).props;
    return { props: parsed, configVersion: result.rows[0].config_version };
  }
  // Support offices created before the props table existed, including a deployment
  // where the migration has not yet imported a legacy map row.
  const legacy = await database.query<{ config: unknown }>("SELECT config FROM app_office_map_layouts WHERE office_id = $1", [officeId]);
  return { props: readRoomLayout(legacy.rows[0]?.config).props, configVersion: 1 };
}

export function validateOfficePropInteractions(props: unknown[]) {
  for (const prop of props) {
    if (typeof prop === "object" && prop !== null && "interaction" in prop && prop.interaction !== undefined && !isValidPropInteraction(prop.interaction)) {
      throw new Error("Office prop interaction is invalid.");
    }
  }
}

export async function saveOfficeProps(username: string, officeId: string, value: unknown, isMaintainer = false, dependencies = officePersistenceDependencies()): Promise<OfficePropsSnapshot> {
  const storage = dependencies.store;
  if (!storage) throw new Error("Office props require PostgreSQL.");
  if (!(await dependencies.role(username, officeId, isMaintainer))) throw new Error("Office not found or access denied.");
  if (typeof value !== "object" || value === null) throw new Error("Office props are invalid.");
  const body = value as { props?: unknown; configVersion?: unknown };
  if (!Number.isInteger(body.configVersion) || Number(body.configVersion) < 1) throw new Error("Office props version is invalid.");
  if (!Array.isArray(body.props) || body.props.length > MAX_OFFICE_PROPS) throw new Error(`Office props limit exceeded (maximum ${MAX_OFFICE_PROPS.toLocaleString()}).`);
  validateOfficePropInteractions(body.props);
  const props = readRoomLayout({ layout: { props: body.props } }).props;
  if (props.length !== body.props.length) throw new Error("Office props contain unsupported or malformed items.");
  const mapConfigResult = await storage.query<{ config: unknown }>("SELECT config FROM app_office_map_layouts WHERE office_id = $1", [officeId]);
  const dimensions = readRoomLayout(mapConfigResult.rows[0]?.config).dimensions ?? { width: 200, depth: 250 };
  const ids = new Set<string>();
  for (let index = 0; index < props.length; index += 1) {
    const prop = props[index]!;
    const original = body.props[index];
    if (typeof original !== "object" || original === null || !("id" in original) || typeof original.id !== "string" || original.id.length < 1 || original.id.length > 128 || ids.has(original.id)) {
      throw new Error("Every office prop needs a unique ID.");
    }
    ids.add(original.id);
    const catalog = ROOM_PROP_CATALOG.find((entry) => entry.asset === prop.asset)!;
    // Collision behavior and footprints are catalog-owned, so a client cannot save
    // different bounds from the preview shown to other members.
    props[index] = { ...prop, id: original.id, collision: catalog.collision, width: catalog.width, depth: catalog.depth };
    const { x, z, width, depth, rotation } = props[index]!;
    if (![x, z, rotation].every(Number.isFinite)) throw new Error("Office prop coordinates are invalid.");
    const rawElevation = "elevation" in original ? original.elevation : 0;
    if (typeof rawElevation !== "number" || !Number.isFinite(rawElevation) || rawElevation < 0 || rawElevation > 15) throw new Error("Office prop elevation is invalid.");
    if (catalog.placementClass === "small" || rawElevation > 0.001) {
      if (!catalog.wallMounted) {
        const support = roomPropPlacementSupport(props.filter((candidate) => candidate.id !== prop.id), prop.asset, x, z, rotation);
        if (!support || Math.abs(support.elevation - rawElevation) > 0.02) throw new Error("Place small props on a table or shelf, and stack shelves on another shelf.");
        props[index]!.elevation = support.elevation;
      }
    }
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));
    const rotatedWidth = width * cos + depth * sin;
    const rotatedDepth = depth * cos + width * sin;
    if (Math.abs(x) + rotatedWidth / 2 > dimensions.width / 2 || Math.abs(z) + rotatedDepth / 2 > dimensions.depth / 2) {
      throw new Error(`A prop is outside the ${dimensions.width} × ${dimensions.depth} m office boundary.`);
    }
  }

  const client = await storage.connect();
  try {
    await client.query("BEGIN");
    // Create the row once, then serialize saves through its row lock.
    await client.query(
      `INSERT INTO app_office_props(office_id, config_version, props)
       VALUES ($1, 1, COALESCE((SELECT config #> '{layout,props}' FROM app_office_map_layouts WHERE office_id = $1), '[]'::jsonb))
       ON CONFLICT (office_id) DO NOTHING`, [officeId],
    );
    const current = await client.query<{ props: unknown; config_version: number }>(
      "SELECT props, config_version FROM app_office_props WHERE office_id = $1 FOR UPDATE", [officeId],
    );
    const row = current.rows[0]!;
    if (row.config_version !== Number(body.configVersion)) {
      await client.query("ROLLBACK");
      throw new OfficePropsVersionConflict({
        props: readRoomLayout({ layout: { props: row.props } }).props,
        configVersion: row.config_version,
      });
    }
    const next = await client.query<{ props: unknown; config_version: number }>(
      `UPDATE app_office_props SET config_version = config_version + 1, props = $2::jsonb, updated_at = now()
       WHERE office_id = $1 RETURNING props, config_version`, [officeId, JSON.stringify(props)],
    );
    await client.query("UPDATE app_offices SET last_activity_at = now() WHERE id = $1", [officeId]);
    await client.query("COMMIT");
    return { props: readRoomLayout({ layout: { props: next.rows[0]!.props } }).props, configVersion: next.rows[0]!.config_version };
  } catch (error) {
    if (!(error instanceof OfficePropsVersionConflict)) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
const officeActivityWriteAt = new Map<string, number>();
const activityWriteIntervalMs = 60 * 60 * 1000;
const inactiveOfficeLimitMs = 30 * 24 * 60 * 60 * 1000;



export async function createOffice(username: string, nameValue: unknown): Promise<OfficeSummary> {
  if (!database) throw new Error("Office management requires PostgreSQL.");
  const name = typeof nameValue === "string" ? nameValue.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 64) throw new Error("Office name must be 2–64 characters.");
  const result = await database.query<{ id: string; name: string; owner_username: string }>(
    "INSERT INTO app_offices(name, owner_username) VALUES ($1, $2) RETURNING id, name, owner_username",
    [name, username],
  );
  const office = result.rows[0];
  return { id: office.id, name: office.name, ownerUsername: office.owner_username, role: "owner" };
}

export async function markOfficeActive(officeId: string, now = Date.now()) {
  if (!database) return;
  if (now - (officeActivityWriteAt.get(officeId) ?? 0) < activityWriteIntervalMs) return;
  officeActivityWriteAt.set(officeId, now);
  await database.query("UPDATE app_offices SET last_activity_at = $2 WHERE id = $1", [officeId, new Date(now)]);
}

export async function pruneInactiveOffices(now = Date.now()) {
  if (!database) return [];
  const cutoff = new Date(now - inactiveOfficeLimitMs);
  await database.query("DELETE FROM app_office_invites WHERE expires_at < now() OR accepted_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days'");
  const deleted = await database.query<{ id: string }>(
    "DELETE FROM app_offices WHERE archived_at IS NULL AND last_activity_at < $1 RETURNING id",
    [cutoff],
  );
  for (const { id } of deleted.rows) officeActivityWriteAt.delete(id);
  return deleted.rows.map(({ id }) => id);
}

export async function listOffices(username: string, isMaintainer = false): Promise<OfficeSummary[]> {
  if (!database) return [];
  const result = await database.query<{
    id: string; name: string; owner_username: string; membership_role: "admin" | "user" | null;
  }>(
    `SELECT offices.id, offices.name, offices.owner_username,
      memberships.role AS membership_role
    FROM app_offices offices
    LEFT JOIN app_office_memberships memberships
      ON memberships.office_id = offices.id AND memberships.username = $1
    WHERE offices.archived_at IS NULL
      AND ($2::boolean OR offices.owner_username = $1 OR memberships.username IS NOT NULL)
    ORDER BY offices.created_at DESC`,
    [username, isMaintainer],
  );
  return result.rows.map((office) => ({
    id: office.id,
    name: office.name,
    ownerUsername: office.owner_username.startsWith("former:") ? "Former owner" : office.owner_username,
    role: isMaintainer ? "maintainer" : office.owner_username === username ? "owner" : office.membership_role ?? "user",
  }));
}

export async function getOfficeRole(username: string, officeId: string, isMaintainer = false): Promise<OfficeRole | null> {
  if (!database) return null;
  const result = await database.query<{
    owner_username: string; membership_role: "admin" | "user" | null;
  }>(
    `SELECT offices.owner_username, memberships.role AS membership_role
    FROM app_offices offices
    LEFT JOIN app_office_memberships memberships
      ON memberships.office_id = offices.id AND memberships.username = $2
    WHERE offices.id = $1 AND offices.archived_at IS NULL`,
    [officeId, username],
  );
  const office = result.rows[0];
  if (!office) return null;
  if (isMaintainer) return "maintainer";
  if (office.owner_username === username) return "owner";
  return office.membership_role;
}

export async function getOfficeMapLayout(username: string, officeId: string, isMaintainer = false) {
  if (!database) throw new Error("Office maps require PostgreSQL.");
  const role = await getOfficeRole(username, officeId, isMaintainer);
  if (!role) throw new Error("Office not found or access denied.");
  const result = await database.query<{ config: unknown; config_version: number }>(
    "SELECT config, config_version FROM app_office_map_layouts WHERE office_id = $1",
    [officeId],
  );
  const config = result.rows[0]?.config ?? EMPTY_OFFICE_MAP;
  const props = await database.query<{ props: unknown }>("SELECT props FROM app_office_props WHERE office_id = $1", [officeId]);
  const effectiveProps = props.rows[0]
    ? readRoomLayout({ layout: { props: props.rows[0].props } }).props
    : readRoomLayout(config).props;
  return {
    config: await projectOfficeDeskConfig(database, officeId, mergeOfficeProps(config, effectiveProps)),
    configVersion: result.rows[0]?.config_version ?? 1,
  };
}

export async function saveOfficeMapLayout(actor: string, isMaintainer: boolean, officeId: string, value: unknown, dependencies = officePersistenceDependencies()) {
  const storage = dependencies.store;
  if (!storage) throw new Error("Office maps require PostgreSQL.");
  const role = await dependencies.role(actor, officeId, isMaintainer);
  if (!role) throw new Error("Office not found or access denied.");
  if (!["owner", "admin", "maintainer"].includes(role)) throw new Error("Only office owners, admins, and maintainers can edit the map.");
  if (typeof value !== "object" || value === null || !("layout" in value)) throw new Error("Map layout is invalid.");
  const expectedVersion = (value as { configVersion?: unknown }).configVersion;
  if (!Number.isInteger(expectedVersion) || Number(expectedVersion) < 1) throw new Error("Office map version is invalid.");
  const rawLayout = (value as { layout?: unknown }).layout;
  if (typeof rawLayout !== "object" || rawLayout === null) throw new Error("Map layout is invalid.");
  const raw = rawLayout as Record<string, unknown>;
  if (raw.dimensions !== undefined) {
    const dimensions = typeof raw.dimensions === "object" && raw.dimensions !== null ? raw.dimensions as Record<string, unknown> : null;
    if (!dimensions || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.depth) || Number(dimensions.width) < 40 || Number(dimensions.depth) < 40 || Number(dimensions.width) > 1000 || Number(dimensions.depth) > 1000) throw new Error("Map dimensions must be between 40 and 1000 m.");
  }
  for (const field of ["props", "zones", "walls", "doors"] as const) {
    const limit = field === "zones" ? 250 : field === "props" ? MAX_OFFICE_PROPS : 1000;
    if (raw[field] !== undefined && (!Array.isArray(raw[field]) || raw[field].length > limit)) {
      throw new Error(`Map ${field} limit exceeded.`);
    }
  }
  if (raw.roadways !== undefined && (!Array.isArray(raw.roadways) || raw.roadways.length > 500)) throw new Error("Map roadways limit exceeded.");
  const wallInputs = Array.isArray(raw.walls) ? raw.walls : [];
  if (wallInputs.some((item) => typeof item === "object" && item !== null && "asset" in item && !ROOM_WALL_MODEL_ASSETS.some((asset) => asset === item.asset))) throw new Error("This wall model is not supported.");
  if (wallInputs.some((item) => typeof item === "object" && item !== null && "color" in item && (typeof item.color !== "string" || !/^#[0-9a-f]{6}$/i.test(item.color)))) throw new Error("Wall color must be a hex color.");
  const doorInputs = Array.isArray(raw.doors) ? raw.doors : [];
  if (doorInputs.some((item) => typeof item === "object" && item !== null && "asset" in item && !ROOM_DOOR_FRAME_ASSETS.some((asset) => asset === item.asset))) throw new Error("This doorway model is not supported.");
  // Props have their own persistence endpoint/table. Map drafts can carry an
  // old or partial props array, so never validate or persist that client copy
  // as part of a map save.
  const parsedLayout = readRoomLayout(value);
  const layout: RoomLayout = { ...parsedLayout, props: [] };
  const config = { version: 1, layout };
  if (layout.zones.length !== (Array.isArray(raw.zones) ? raw.zones.length : 0) ||
      layout.walls.length !== (Array.isArray(raw.walls) ? raw.walls.length : 0) ||
      layout.doors.length !== (Array.isArray(raw.doors) ? raw.doors.length : 0) ||
      (layout.roadways?.length ?? 0) !== (Array.isArray(raw.roadways) ? raw.roadways.length : 0)) {
    throw new Error("Map contains unsupported or malformed items.");
  }
  if (raw.spawnPoint !== undefined && !layout.spawnPoint) throw new Error("Spawn point is invalid.");
  const mapWidth = layout.dimensions?.width ?? 200;
  const mapDepth = layout.dimensions?.depth ?? 250;
  const inside = (x: number, z: number, width = 0, depth = 0) =>
    Math.abs(x) + width / 2 <= mapWidth / 2 && Math.abs(z) + depth / 2 <= mapDepth / 2;
  if (layout.props.some((prop) => !inside(prop.x, prop.z, prop.width, prop.depth))) throw new Error(`A prop is outside the ${mapWidth} × ${mapDepth} m office boundary.`);
  if (layout.zones.some((zone) => zone.width < 1 || zone.depth < 1 || !inside(zone.x, zone.z, zone.width, zone.depth))) throw new Error(`A zone is outside the ${mapWidth} × ${mapDepth} m office boundary.`);
  if (layout.walls.some((wall) => !inside(wall.x, wall.z, wall.axis === "horizontal" ? wall.length : wall.thickness, wall.axis === "vertical" ? wall.length : wall.thickness))) throw new Error(`A wall is outside the ${mapWidth} × ${mapDepth} m office boundary.`);
  if (layout.roadways?.some((road) => !inside(road.x, road.z, road.width, road.depth))) throw new Error(`A road is outside the ${mapWidth} × ${mapDepth} m office boundary.`);
  if (layout.doors.some((door) => { const wall = layout.walls.find((entry) => entry.id === door.wallId); return !wall || Math.abs(door.offset) + door.width / 2 > wall.length / 2; })) throw new Error("A doorway must fit entirely within its wall.");
  const previousResult = await storage.query<{ config: unknown }>("SELECT config FROM app_office_map_layouts WHERE office_id = $1", [officeId]);
  const previousLayout = readRoomLayout(previousResult.rows[0]?.config);
  const changedZoneIds = new Set(layout.zones.filter((zone) => {
    const previousZone = previousLayout.zones.find((entry) => entry.id === zone.id);
    const zoneSnapshot = (source: typeof layout, selectedZone: typeof zone | undefined) => selectedZone ? {
      zone: selectedZone,
      walls: source.walls.filter((wall) => wall.id.startsWith(`${selectedZone.id}-`)),
      doors: source.doors.filter((door) => door.id.startsWith(`${selectedZone.id}-`)),
    } : null;
    return JSON.stringify(zoneSnapshot(layout, zone)) !== JSON.stringify(zoneSnapshot(previousLayout, previousZone));
  }).map((zone) => zone.id));
  const blockedEntrance = roomZoneEntranceIssues(layout, changedZoneIds)[0];
  if (blockedEntrance) throw new Error("This room entrance is blocked. Move the zone away from the map edge or another wall, or choose a different door wall.");
  if (layout.spawnPoint && !isPositionWalkable(layout.spawnPoint, campusWorldFromConfig(config))) throw new Error("The spawn point must be placed on walkable ground.");
  const client = await storage.connect();
  try {
    await client.query("BEGIN");
    // Materialize the default version under the same transaction so concurrent
    // first saves serialize just like edits to an existing map.
    await client.query(
      `INSERT INTO app_office_map_layouts(office_id, config_version, config, updated_at)
       VALUES ($1, 1, $2::jsonb, now()) ON CONFLICT (office_id) DO NOTHING`,
      [officeId, JSON.stringify(EMPTY_OFFICE_MAP)],
    );
    const current = await client.query<{ config: unknown; config_version: number }>(
      "SELECT config, config_version FROM app_office_map_layouts WHERE office_id = $1 FOR UPDATE",
      [officeId],
    );
    const currentRow = current.rows[0]!;
    if (currentRow.config_version !== Number(expectedVersion)) {
      const savedProps = await client.query<{ props: unknown }>(
        "SELECT props FROM app_office_props WHERE office_id = $1", [officeId],
      );
      const latestConfig = savedProps.rows[0]
        ? mergeOfficeProps(currentRow.config, readRoomLayout({ layout: { props: savedProps.rows[0].props } }).props)
        : currentRow.config;
      await client.query("ROLLBACK");
      throw new OfficeMapVersionConflict({ config: latestConfig, configVersion: currentRow.config_version });
    }
    // Serialize against props saves and use the latest server-owned props when
    // writing the map document. This prevents an older map draft (or one with
    // an empty props array) from wiping props that other members already saved.
    const savedProps = await client.query<{ props: unknown }>(
      "SELECT props FROM app_office_props WHERE office_id = $1 FOR UPDATE", [officeId],
    );
    const currentLayout = readRoomLayout(currentRow.config);
    const latestProps = savedProps.rows[0]
      ? readRoomLayout({ layout: { props: savedProps.rows[0].props } }).props
      : currentLayout.props;
    await assertDeskMembership(client, officeId, actor, isMaintainer, true);
    const canonicalLayout = await reconcileOfficeDesks(client, officeId, layout);
    const persistedConfig = { version: 1, layout: { ...canonicalLayout, props: latestProps } };
    const result = await client.query<{ config: unknown; config_version: number }>(
      `UPDATE app_office_map_layouts
       SET config_version = config_version + 1, config = $2::jsonb, updated_at = now()
       WHERE office_id = $1 RETURNING config, config_version`,
      [officeId, JSON.stringify(persistedConfig)],
    );
    await client.query("UPDATE app_offices SET last_activity_at = now() WHERE id = $1", [officeId]);
    await client.query("COMMIT");
    return { config: result.rows[0]!.config, configVersion: result.rows[0]!.config_version };
  } catch (error) {
    if (!(error instanceof OfficeMapVersionConflict)) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function claimOfficeDeskZone(username: string, officeId: string, zoneId: string) {
  return new DeskRepository().change(username, officeId, { zoneId }, true);
}

export async function unclaimOfficeDeskZone(username: string, officeId: string, zoneId: string) {
  return new DeskRepository().change(username, officeId, { zoneId }, false);
}

export async function getOfficeMembers(username: string, officeId: string, isMaintainer = false) {
  if (!database) throw new Error("Office management requires PostgreSQL.");
  const role = await getOfficeRole(username, officeId, isMaintainer);
  if (!role) throw new Error("Office not found or access denied.");
  const officeResult = await database.query<{ name: string; owner_username: string }>(
    "SELECT name, owner_username FROM app_offices WHERE id = $1 AND archived_at IS NULL",
    [officeId],
  );
  const office = officeResult.rows[0];
  if (!office) throw new Error("Office not found.");
  const members = await database.query<{ username: string; role: "admin" | "user"; joined_at: Date }>(
    "SELECT username, role, joined_at FROM app_office_memberships WHERE office_id = $1 ORDER BY role, username",
    [officeId],
  );
  return {
    office: { id: officeId, name: office.name, ownerUsername: office.owner_username.startsWith("former:") ? "Former owner" : office.owner_username, role },
    members: [{ username: office.owner_username.startsWith("former:") ? "Former owner" : office.owner_username, role: "owner", joinedAt: null }, ...members.rows.map((member) => ({
      username: member.username,
      role: member.role,
      joinedAt: member.joined_at.toISOString(),
    }))],
  };
}

export async function listInvites(username: string): Promise<OfficeInviteSummary[]> {
  if (!database) return [];
  const result = await database.query<{
    id: string; office_id: string; office_name: string; created_by: string; role: "admin" | "user"; expires_at: Date;
  }>(
    `SELECT invites.id, invites.office_id, offices.name AS office_name, invites.created_by, invites.role, invites.expires_at
    FROM app_office_invites invites JOIN app_offices offices ON offices.id = invites.office_id
    WHERE invites.invited_username = $1
      AND invites.accepted_at IS NULL AND invites.revoked_at IS NULL
      AND invites.expires_at > now() AND offices.archived_at IS NULL
    ORDER BY invites.created_at DESC`,
    [username],
  );
  return result.rows.map((invite) => ({
    id: invite.id, officeId: invite.office_id, officeName: invite.office_name,
    inviter: invite.created_by, role: invite.role, expiresAt: invite.expires_at.toISOString(),
  }));
}

export async function createOfficeInvite(
  actor: string,
  isMaintainer: boolean,
  officeId: string,
  invitedUsernameValue: unknown,
  roleValue: unknown,
) {
  if (!database) throw new Error("Office management requires PostgreSQL.");
  const invitedUsername = typeof invitedUsernameValue === "string" ? invitedUsernameValue.trim().toLowerCase() : null;
  const role = roleValue === "admin" ? "admin" : "user";
  if (invitedUsernameValue !== undefined && (!invitedUsername || !/^[a-z0-9_.-]{3,24}$/.test(invitedUsername))) {
    throw new Error("Enter a valid account username, or leave it blank to create a one-time invite link.");
  }
  const actorRole = await getOfficeRole(actor, officeId, isMaintainer);
  if (!actorRole || !["owner", "admin", "maintainer"].includes(actorRole)) throw new Error("You cannot invite members to this office.");
  if (role === "admin" && !["owner", "maintainer"].includes(actorRole)) throw new Error("Only the owner or maintainer can invite an admin.");
  if (invitedUsername) {
    const user = await database.query("SELECT 1 FROM app_users WHERE username = $1", [invitedUsername]);
    if (user.rowCount === 0) throw new Error("No account uses that username yet.");
    if (await getOfficeRole(invitedUsername, officeId)) throw new Error("That account is already an office member.");
  }
  const token = randomBytes(32).toString("base64url");
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    if (invitedUsername) {
      await client.query(
        "UPDATE app_office_invites SET revoked_at = now() WHERE office_id = $1 AND invited_username = $2 AND accepted_at IS NULL AND revoked_at IS NULL",
        [officeId, invitedUsername],
      );
    }
    const result = await client.query<{ id: string; expires_at: Date }>(
      `INSERT INTO app_office_invites(office_id, invited_username, role, token_hash, created_by, expires_at)
      VALUES ($1, $2, $3, $4, $5, now() + interval '7 days') RETURNING id, expires_at`,
      [officeId, invitedUsername, role, tokenHash(token), actor],
    );
    await client.query("UPDATE app_offices SET last_activity_at = now() WHERE id = $1", [officeId]);
    await recordAuditEvent(client, {
      actorUsername: actor, action: "office_invite.issued", targetType: "office", targetId: officeId,
      metadata: { role, inviteType: invitedUsername ? "account" : "link" },
    });
    await client.query("COMMIT");
    return { id: result.rows[0].id, token, role, expiresAt: result.rows[0].expires_at.toISOString() };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function acceptOfficeInvite(username: string, tokenValue: unknown) {
  if (!database) throw new Error("Office management requires PostgreSQL.");
  const inviteId = typeof tokenValue === "number" && Number.isSafeInteger(tokenValue) && tokenValue > 0
    ? String(tokenValue)
    : typeof tokenValue === "string" && /^\d{1,19}$/.test(tokenValue) && BigInt(tokenValue) <= 9223372036854775807n
      ? tokenValue
      : null;
  const token = typeof tokenValue === "string" && !inviteId && tokenValue.length >= 30 && tokenValue.length <= 100 ? tokenValue : null;
  if (!inviteId && !token) throw new Error("Invite is invalid or expired.");
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const inviteResult = await client.query<{
      id: string; office_id: string; invited_username: string | null; role: "admin" | "user";
    }>(
      `SELECT id, office_id, invited_username, role FROM app_office_invites
      WHERE (($1::text IS NOT NULL AND token_hash = $1) OR ($2::bigint IS NOT NULL AND id = $2 AND invited_username = $3))
        AND (invited_username IS NULL OR invited_username = $3)
        AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
      FOR UPDATE`,
      [token ? tokenHash(token) : null, inviteId, username],
    );
    const invite = inviteResult.rows[0];
    if (!invite || (invite.invited_username && invite.invited_username !== username)) throw new Error("Invite is invalid or expired.");
    const officeResult = await client.query<{ owner_username: string; archived_at: Date | null }>(
      "SELECT owner_username, archived_at FROM app_offices WHERE id = $1 FOR UPDATE",
      [invite.office_id],
    );
    const office = officeResult.rows[0];
    if (!office || office.archived_at) throw new Error("Office is not available.");
    if (office.owner_username !== username) {
      await client.query(
        `INSERT INTO app_office_memberships(office_id, username, role, added_by)
        VALUES ($1, $2, $3, (SELECT created_by FROM app_office_invites WHERE id = $4))
        ON CONFLICT (office_id, username) DO UPDATE SET role =
          CASE WHEN app_office_memberships.role = 'admin' THEN 'admin' ELSE EXCLUDED.role END`,
        [invite.office_id, username, invite.role, invite.id],
      );
    }
    await client.query("UPDATE app_office_invites SET accepted_at = now(), accepted_by_username = $2 WHERE id = $1", [invite.id, username]);
    await client.query("UPDATE app_offices SET last_activity_at = now() WHERE id = $1", [invite.office_id]);
    await client.query("COMMIT");
    return invite.office_id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setOfficeMemberRole(actor: string, isMaintainer: boolean, officeId: string, target: string, nextRole: unknown) {
  if (!database) throw new Error("Office management requires PostgreSQL.");
  if (nextRole !== "admin" && nextRole !== "user") throw new Error("Role must be admin or user.");
  const actorRole = await getOfficeRole(actor, officeId, isMaintainer);
  if (!actorRole) throw new Error("Office not found or access denied.");
  if (actorRole === "user") throw new Error("You cannot manage office roles.");
  const current = await getOfficeRole(target, officeId);
  if (!current || current === "owner") throw new Error("The office owner cannot be changed as a member.");
  if (nextRole === "admin" && !["owner", "maintainer"].includes(actorRole)) throw new Error("Only the owner or maintainer can appoint an admin.");
  if (current === "admin" && !["owner", "maintainer"].includes(actorRole)) throw new Error("Only the owner or maintainer can change an admin.");
  if (current === nextRole) return;
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE app_office_memberships SET role = $3 WHERE office_id = $1 AND username = $2", [officeId, target, nextRole]);
    await client.query("UPDATE app_offices SET last_activity_at = now() WHERE id = $1", [officeId]);
    await recordAuditEvent(client, {
      actorUsername: actor, action: "office_member.role_changed", targetType: "account", targetId: target,
      metadata: { officeId, fromRole: current, toRole: nextRole },
    });
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function removeOfficeMember(actor: string, isMaintainer: boolean, officeId: string, target: string) {
  if (!database) throw new Error("Office management requires PostgreSQL.");
  const actorRole = await getOfficeRole(actor, officeId, isMaintainer);
  if (!actorRole) throw new Error("Office not found or access denied.");
  if (actorRole === "user" && actor !== target) throw new Error("You can only leave the office yourself.");
  const targetRole = await getOfficeRole(target, officeId);
  if (!targetRole || targetRole === "owner") throw new Error("The office owner cannot be removed.");
  if (targetRole === "admin" && !["owner", "maintainer"].includes(actorRole)) throw new Error("Only the owner or maintainer can remove an admin.");
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const map = await client.query<{ config: unknown }>("SELECT config FROM app_office_map_layouts WHERE office_id = $1 FOR UPDATE", [officeId]);
    await assertDeskMembership(client, officeId, actor, isMaintainer);
    await client.query("DELETE FROM app_office_memberships WHERE office_id = $1 AND username = $2", [officeId, target]);
    await client.query("UPDATE app_office_desks SET owner_username = NULL, updated_at = now() WHERE office_id = $1 AND owner_username = $2 AND retired_at IS NULL", [officeId, target]);
    if (map.rows[0]) {
      await persistDeskProjection(client, officeId, map.rows[0].config);

    }
    await client.query("UPDATE app_offices SET last_activity_at = now() WHERE id = $1", [officeId]);
    await recordAuditEvent(client, {
      actorUsername: actor, action: "office_member.removed", targetType: "account", targetId: target,
      metadata: { officeId, previousRole: targetRole },
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateOfficeName(actor: string, isMaintainer: boolean, officeId: string, nameValue: unknown) {
  if (!database) throw new Error("Office management requires PostgreSQL.");
  const actorRole = await getOfficeRole(actor, officeId, isMaintainer);
  if (actorRole !== "owner" && actorRole !== "maintainer") throw new Error("Only the owner or maintainer can change the office name.");
  const name = typeof nameValue === "string" ? nameValue.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 64) throw new Error("Office name must be 2–64 characters.");
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ name: string }>("SELECT name FROM app_offices WHERE id = $1 AND archived_at IS NULL FOR UPDATE", [officeId]);
    if (!current.rows[0]) throw new Error("Office not found.");
    const previousName = current.rows[0].name;
    await client.query("UPDATE app_offices SET name = $2, last_activity_at = now() WHERE id = $1", [officeId, name]);
    if (previousName !== name) {
      await recordAuditEvent(client, { actorUsername: actor, action: "office.renamed", targetType: "office", targetId: officeId });
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  return name;
}

export async function deleteOffice(actor: string, isMaintainer: boolean, officeId: string) {
  if (!database) throw new Error("Office management requires PostgreSQL.");
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ owner_username: string }>(
      "SELECT owner_username FROM app_offices WHERE id = $1 AND archived_at IS NULL FOR UPDATE",
      [officeId],
    );
    const office = result.rows[0];
    if (!office) throw new Error("Office not found.");
    if (!isMaintainer && office.owner_username !== actor) throw new Error("Only the office owner can delete this office.");
    await recordAuditEvent(client, { actorUsername: actor, action: "office.deleted", targetType: "office", targetId: officeId });
    // Office-owned records use ON DELETE CASCADE, so membership, invite,
    // room, map, zone, and activity data are removed in this transaction.
    await client.query("DELETE FROM app_offices WHERE id = $1", [officeId]);
    await client.query("COMMIT");
    officeActivityWriteAt.delete(officeId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
