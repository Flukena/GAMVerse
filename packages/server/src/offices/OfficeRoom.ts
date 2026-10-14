import { disposedRoomSpotlightUsernames } from "./spotlightRoomDisposal.js";
import { trackReconnectionSeat } from "./reconnectionSeat.js";
import { readReconnectAccess, SessionSecurity } from "./sessionSecurity.js";
import { registerSocialMessages, unregisterSocialMessages, socialPeople } from "./socialMessages.js";
import { OFFICE_ACCESS_REVOKED_CLOSE_CODE, OFFICE_CLOSED_CLOSE_CODE, Spotlight, spotlightDepartureReason, type SpotlightDeparture } from "./spotlight.js";
import { defineRoom, Room, type AuthContext, type Client } from "@colyseus/core";
import { createHash } from "node:crypto";
import { shouldClearHandRaise, INPUT_MIN_INTERVAL_MS, RECONNECTION_SEAT_TIMEOUT_SECONDS, CAMPUS_WORLD, campusWorldFromConfig, DEFAULT_CHARACTER_ID, isPositionWalkable, isValidJumpInput, isValidMovementInput, JUMP_DURATION_MS, resolvePlayerFacing, type MovementInput, KENNEY_BLASTER_IDS, KENNEY_CHARACTER_IDS, KENNEY_PET_IDS, KENNEY_VEHICLE_IDS, movePlayer, OfficeState, PlayerState, parseRoomPropSeatReference, readRoomLayout, ROOM_PROP_CATALOG, roomLayoutZoneAt, roomPropCollisionClearanceRadius, roomPropCollisionFootprint, roomPropSeatAnchors, roomPropSeatReference, USER_STATUSES, WORLD, type KenneyBlasterId, type KenneyCharacterId, type RoomLayout, type RoomLayoutZone, type UserStatus, type WorldConfig } from "@gammyverse/shared";
import { getAccountNickname, getSession, markUserActive } from "../auth/service.js";
import { isCustomCharacterId, userOwnsCharacterModel } from "../auth/characterModels.js";
import { getOfficeRole, markOfficeActive } from "./repository.js";
import { liveKitIdentity, revokeMeetingParticipant, revokePrivateVoiceParticipant, revokeProximityParticipants } from "../media/service.js";
import { recordOfficeActivity } from "./activity.js";
import { database } from "../infra/db.js";
import { logServerError, logServerEvent } from "../infra/logger.js";

// At most ceil(1000 / 30) = 34 input messages/s. Allow a three-second
// buffered movement burst (102) plus 26 control/handshake messages.
const OFFICE_MAX_MESSAGES_PER_SECOND_COUNT = 128;
const INITIAL_MESSAGE_COUNT = 0;
const REPLACED_SESSION_CLOSE_CODE = 4001;
const OFFICE_ACCESS_REVOKED_REASON = "Office access changed. Reopen the office.";
const REPLACED_SESSION_REASON = "This account connected from another session.";
const ACCOUNT_SUSPENDED_REASON_LABEL = "Account access was suspended.";
const OFFICE_DELETED_REASON_LABEL = "This office was deleted.";
const SECURITY_DEPARTURE_LABEL = "security";
const SPOTLIGHT_CLOSE_FAILED_EVENT_LABEL = "spotlight.close.failed";
const RECONNECT_ACCESS_FAILED_EVENT_LABEL = "office.client.reconnect.access.failed";

type DropDiagnosticClient = Client & {
  _numMessagesLastSecond?: number;
  _messageCountResetsAt?: number;
  _lastMessageTime?: number;
};

type MediaZoneTransition = { sessionId: string; zone: RoomLayoutZone; direction: "enter" | "exit" };

type InputState = MovementInput & { sprint: boolean; receivedAt: number };
type Position = { x: number; z: number };
type AutoRoute = { points: Position[]; index: number; stalledTicks: number; followTargetSessionId?: string; sitOnArrivalPropId?: string; sitOnArrivalZoneId?: string; destination?: Position; fastWalkFallback?: boolean };

function autoMoveLandingPoint(destination: Position, world: WorldConfig, zone?: RoomLayoutZone) {
  const isInsideZone = (point: Position) => !zone || (Math.abs(point.x - zone.x) <= zone.width / 2 - world.playerRadius && Math.abs(point.z - zone.z) <= zone.depth / 2 - world.playerRadius);
  if (isInsideZone(destination) && isPositionWalkable(destination, world)) return destination;
  for (let radius = 0.25; radius <= 3.25; radius += 0.25) {
    const candidates = Array.from({ length: 24 }, (_, index) => {
      const angle = index * Math.PI / 12;
      return { x: destination.x + Math.cos(angle) * radius, z: destination.z + Math.sin(angle) * radius };
    }).filter((candidate) => isInsideZone(candidate) && isPositionWalkable(candidate, world));
    if (candidates.length) return candidates[0]!;
  }
  return null;
}

function ghostCollisionWorld(world: WorldConfig): WorldConfig {
  // isPositionWalkable still enforces WORLD.width/depth; only internal walls
  // and prop blockers are ignored while Ghost mode is active.
  return { ...world, walls: [], obstacles: [], collisionGrid: undefined };
}

// Normal walking uses one and a half times the base world movement speed.
const NORMAL_WALK_SPEED_MULTIPLIER = 1.5;
// When vehicle auto-routing cannot be used, keep walking ten times faster
// than normal walking so the fallback remains practical.
const AUTO_MOVE_WALK_FALLBACK_MULTIPLIER = NORMAL_WALK_SPEED_MULTIPLIER * 10;
type SeatApproachWorld = { world: WorldConfig; propId: string };
type ActiveFollow = { targetSessionId: string; nextRepathAt: number; lastTargetX: number; lastTargetZ: number };
type PendingSit = { propId: string; startedAt: number; x: number; z: number };
const activityRefreshIntervalMs = 60_000;
const autoSitDelayMs = 3_000;
const autoSitSeatRadius = 3;

function worldGeometrySignature(layout: RoomLayout) {
  const byId = <T extends { id: string }>(items: T[]) => [...items].sort((first, second) => first.id.localeCompare(second.id));
  return JSON.stringify({
    dimensions: layout.dimensions ?? null,
    props: byId(layout.props).map(({ id, asset, x, z, rotation, width, depth, collision, elevation }) => [id, asset, x, z, rotation, width, depth, collision, elevation ?? null]),
    zones: byId(layout.zones).map(({ id, kind, x, z, width, depth }) => [id, kind, x, z, width, depth]),
    walls: byId(layout.walls).map(({ id, axis, x, z, length, thickness, height, color, asset }) => [id, axis, x, z, length, thickness, height, color ?? null, asset ?? null]),
    doors: byId(layout.doors).map(({ id, wallId, offset, width, kind, leaves, asset }) => [id, wallId, offset, width, kind ?? null, leaves ?? null, asset ?? null]),
    roadways: byId(layout.roadways ?? []).map(({ id, x, z, width, depth, kind }) => [id, x, z, width, depth, kind]),
    spawnPoint: layout.spawnPoint ?? null,
  });
}

export class OfficeRoom extends Room<{ state: InstanceType<typeof OfficeState> }> {
  private static roomsByOffice = new Map<string, Set<OfficeRoom>>();

  static getOperationsCounts() {
    let activeRoomCount = 0;
    let activeParticipantCount = 0;
    for (const rooms of OfficeRoom.roomsByOffice.values()) {
      for (const room of rooms) {
        activeRoomCount += 1;
        activeParticipantCount += room.clients.length;
      }
    }
    return { activeRoomCount, activeParticipantCount };
  }

  private spotlight?: Spotlight;
  state = new OfficeState();
  private officeId = "";
  private roomKey = "lobby";
  private world: WorldConfig = CAMPUS_WORLD;
  private worldVersion = 1;
  private mapConfig: unknown = { version: 1, layout: { version: 1, props: [], zones: [], walls: [], doors: [] } };
  private mapLayout: RoomLayout = readRoomLayout(this.mapConfig);
  private movementInputs = new Map<string, InputState>();
  /** Vehicle drivers need collision computed without the vehicle they're mounted in. */
  private vehicleWorldsBySessionId = new Map<string, WorldConfig>();
  /** Ignore a driver's own parked vehicle while they walk out to a room seat. */
  private seatApproachWorldsBySessionId = new Map<string, SeatApproachWorld>();
  private autoRoutes = new Map<string, AutoRoute>();
  private ghostModeBySessionId = new Map<string, boolean>();
  private pendingSitsBySessionId = new Map<string, PendingSit>();
  private activeFollowsBySessionId = new Map<string, ActiveFollow>();
  private lastWaveAtBySessionId = new Map<string, number>();
  private lastJumpAtBySessionId = new Map<string, number>();
  private lastPacketAt = new Map<string, number>();
  private activityRefreshAtBySessionId = new Map<string, number>();
  private lastBlasterShotAtBySessionId = new Map<string, number>();
  private usernamesBySessionId = new Map<string, string>();
  private proximityBySessionId = new Map<string, Set<string>>();
  private proximityGroupBySessionId = new Map<string, string>();
  private proximityGroupMembersById = new Map<string, Set<string>>();
  private meetingMembersBySessionId = new Set<string>();
  private privateZoneIdBySessionId = new Map<string, string>();
  private mediaZoneBySessionId = new Map<string, RoomLayoutZone>();
  private lockedZoneIds = new Set<string>();
  private mediaIdentityBySessionId = new Map<string, string>();
  private sessionSecurity = new SessionSecurity();
  private shuttingDown = false;
  private officeRolesBySessionId = new Map<string, string>();
  private mapEditorSessionId: string | null = null;
  private mapEditorUsername: string | null = null;

  async onCreate(options: { officeId: string }) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.officeId)) {
      throw new Error("A valid office is required.");
    }
    this.setMetadata({ officeId: options.officeId });
    this.officeId = options.officeId;
    this.roomKey = "lobby";
    if (database) {
      const savedMap = await database.query<{ config: unknown; office_props: unknown | null }>(
        `SELECT maps.config, office_props.props AS office_props
         FROM app_offices offices
         LEFT JOIN app_office_map_layouts maps ON maps.office_id = offices.id
         LEFT JOIN app_office_props office_props ON office_props.office_id = offices.id
         WHERE offices.id = $1`, [this.officeId],
      );
      if (savedMap.rows[0]) this.mapConfig = OfficeRoom.mergeSavedProps(savedMap.rows[0].config ?? this.mapConfig, savedMap.rows[0].office_props);
    }
    this.mapLayout = readRoomLayout(this.mapConfig);
    this.world = campusWorldFromConfig(this.mapConfig);
    this.worldVersion = 4;
    this.setMetadata({ officeId: this.officeId });
    const maxClients = Number(process.env.ROOM_MAX_CLIENTS ?? 150);
    if (!Number.isInteger(maxClients) || maxClients < 1) throw new Error("ROOM_MAX_CLIENTS must be a positive integer.");
    this.maxClients = maxClients;
    const rooms = OfficeRoom.roomsByOffice.get(options.officeId) ?? new Set<OfficeRoom>();
    rooms.add(this);
    OfficeRoom.roomsByOffice.set(options.officeId, rooms);
    this.patchRate = 50;
    this.maxMessagesPerSecond = OFFICE_MAX_MESSAGES_PER_SECOND_COUNT;
    logServerEvent("realtime", "office.room.created", { roomId: this.roomId, officeId: this.officeId, maxClients });

    this.spotlight = registerSocialMessages(this, this.officeId, {
      username: id => this.usernamesBySessionId.get(id),
      player: id => this.state.players.get(id),
      people: () => socialPeople(this.state.players.entries(), this.mediaZoneBySessionId, this.proximityGroupBySessionId),
      client: id => this.clients.find(client => client.sessionId === id),
    });
    this.onMessage("request-spatial-state", (client: Client) => {
      client.send("spotlight-state", this.spotlight?.snapshot());
      client.send("proximity", { sessionIds: [...(this.proximityBySessionId.get(client.sessionId) ?? [])] });
      client.send("proximity-group", { groupId: this.proximityGroupBySessionId.get(client.sessionId) ?? null });
      client.send("meeting-zone", { meetingId: this.roomKey, active: this.meetingMembersBySessionId.has(client.sessionId) });
      this.sendMediaZone(client, client.sessionId);
      client.send("zone-locks", { zoneIds: [...this.lockedZoneIds] });
      client.send("map-edit-lock", { editorUsername: this.mapEditorUsername });
    });
    this.onMessage("map-edit-lock", (client: Client, payload: unknown) => {
      if (typeof payload !== "object" || payload === null || !("active" in payload) || typeof payload.active !== "boolean") return;
      if (!payload.active) {
        if (this.mapEditorSessionId === client.sessionId) this.releaseMapEditLock(client.sessionId);
        return;
      }
      const role = this.officeRolesBySessionId.get(client.sessionId);
      if (role !== "owner" && role !== "admin") {
        client.send("map-edit-lock-result", { granted: false, error: "Only the office owner or an admin can edit the map." });
        return;
      }
      if (this.mapEditorSessionId && this.mapEditorSessionId !== client.sessionId) {
        client.send("map-edit-lock-result", { granted: false, editorUsername: this.mapEditorUsername });
        return;
      }
      this.mapEditorSessionId = client.sessionId;
      this.mapEditorUsername = this.usernamesBySessionId.get(client.sessionId) ?? null;
      this.broadcast("map-edit-lock", { editorUsername: this.mapEditorUsername });
      client.send("map-edit-lock-result", { granted: true });
    });
    this.onMessage("zone-lock", (client: Client, payload: unknown) => {
      if (typeof payload !== "object" || payload === null || !("zoneId" in payload) || !("locked" in payload) || typeof payload.zoneId !== "string" || typeof payload.locked !== "boolean") return;
      const zone = this.mediaZoneBySessionId.get(client.sessionId);
      if (!zone || zone.id !== payload.zoneId) return;
      if (zone.kind === "private" && zone.ownerUsername !== this.usernamesBySessionId.get(client.sessionId)) return;
      if (payload.locked) this.lockedZoneIds.add(zone.id);
      else this.lockedZoneIds.delete(zone.id);
      const current = this.lockedZoneIds.has(zone.id);
      this.broadcast("zone-locks", { zoneIds: [...this.lockedZoneIds], zoneId: zone.id, locked: current });
    });
    this.onMessage("character", async (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || typeof payload !== "string") return;
      if (!KENNEY_CHARACTER_IDS.includes(payload as KenneyCharacterId)) {
        if (!isCustomCharacterId(payload) || !(await userOwnsCharacterModel(this.usernamesBySessionId.get(client.sessionId) ?? "", payload))) return;
      }
      player.characterId = payload;
    });
    this.onMessage("nickname", async (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      const username = this.usernamesBySessionId.get(client.sessionId);
      if (!player || !username) return;
      try { player.displayName = (await getAccountNickname(username))?.trim() || username; }
      catch (error) { logServerError("realtime", "office.nickname.refresh.failed", error, { username, sessionId: client.sessionId }); }
    });
    this.onMessage("pet", (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || typeof payload !== "string") return;
      if (payload !== "" && !KENNEY_PET_IDS.includes(payload as (typeof KENNEY_PET_IDS)[number])) return;
      player.petId = payload;
    });
    this.onMessage("dance", (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || typeof payload !== "object" || payload === null || !("toggle" in payload) || payload.toggle !== true) return;
      player.dancing = !player.dancing && !player.vehicleId && !player.sittingPropId;
    });
    this.onMessage("jump", (client: Client, payload: unknown) => {
      if (!isValidJumpInput(payload)) return;
      const player = this.state.players.get(client.sessionId);
      if (!player || player.presence !== "online" || player.vehicleId || player.sittingPropId || player.status === "do-not-disturb" || player.status === "in-meeting") return;
      const now = performance.now();
      if (now - (this.lastJumpAtBySessionId.get(client.sessionId) ?? -JUMP_DURATION_MS) < JUMP_DURATION_MS) return;
      this.lastJumpAtBySessionId.set(client.sessionId, now);
      this.broadcast("player-jump", { sessionId: client.sessionId });
    });
    this.onMessage("weapon-equip", (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || (payload !== "" && (typeof payload !== "string" || !KENNEY_BLASTER_IDS.includes(payload as KenneyBlasterId)))) return;
      player.weaponId = payload as string;
    });
    this.onMessage("user-status", (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || typeof payload !== "object" || payload === null || !("status" in payload) || typeof payload.status !== "string" || !USER_STATUSES.includes(payload.status as UserStatus)) return;
      const previousStatus = player.status;
      player.status = payload.status;
      if (previousStatus !== player.status) logServerEvent("realtime", "office.status.changed", { roomId: this.roomId, officeId: this.officeId, sessionId: client.sessionId, username: this.usernamesBySessionId.get(client.sessionId), previousStatus, status: player.status });
      if (player.status === "do-not-disturb" || player.status === "in-meeting") {
        this.stopFollowing(client.sessionId, "stopped");
        this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
        this.pendingSitsBySessionId.delete(client.sessionId);
        if (this.autoRoutes.delete(client.sessionId)) {
          client.send("auto-move-status", { status: "cancelled" });
          if (player.vehicleMode === "auto") this.exitVehicle(client.sessionId, player);
        }
      }
      // The schema is the durable-in-session source of truth. This event gives
      // clients a lightweight explicit notification for status UI and audio policy.
      this.broadcast("user-status", { sessionId: client.sessionId, status: player.status });
    });
    this.onMessage("blaster-shot", (client: Client, payload: unknown) => {
      const shooter = this.state.players.get(client.sessionId);
      if (!shooter || shooter.status === "do-not-disturb" || shooter.status === "in-meeting" || !shooter.weaponId || typeof payload !== "object" || payload === null) return;
      const shot = payload as { start?: unknown; end?: unknown; targetSessionId?: unknown };
      const readVector = (value: unknown) => {
        if (typeof value !== "object" || value === null || !("x" in value) || !("y" in value) || !("z" in value)) return null;
        const vector = value as { x: unknown; y: unknown; z: unknown };
        if (![vector.x, vector.y, vector.z].every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))) return null;
        return { x: vector.x as number, y: vector.y as number, z: vector.z as number };
      };
      const start = readVector(shot.start);
      const end = readVector(shot.end);
      if (!start || !end) return;
      const now = performance.now();
      if (now - (this.lastBlasterShotAtBySessionId.get(client.sessionId) ?? 0) < 220) return;
      const sceneX = shooter.x + this.world.width / 2;
      const sceneZ = shooter.z + this.world.depth / 2;
      if (Math.hypot(start.x - sceneX, start.z - sceneZ) > 4 || start.y < 0 || start.y > 8) return;
      const shotDistance = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
      // Keep both the tracer and hit scan inside a short, predictable range.
      // Map coordinates are expressed in world units, so 10 here is 10 grid
      // blocks/meters in the office map.
      const maxShotRange = 10;
      if (shotDistance < 0.2 || shotDistance > maxShotRange) return;
      this.lastBlasterShotAtBySessionId.set(client.sessionId, now);
      const event = { shooterSessionId: client.sessionId, start, end };
      // Send transient tracer events only to active clients within 100 map
      // units of the shooter, rather than broadcasting to the whole office.
      for (const recipient of this.clients) {
        if (recipient.sessionId === client.sessionId) continue;
        const observer = this.state.players.get(recipient.sessionId);
        if (!observer || observer.presence !== "online") continue;
        if (Math.hypot(observer.x - shooter.x, observer.z - shooter.z) <= 100) recipient.send("blaster-shot", event);
      }
      if (typeof shot.targetSessionId !== "string" || shot.targetSessionId === client.sessionId) return;
      const target = this.state.players.get(shot.targetSessionId);
      // The validated muzzle-to-impact segment already enforces the 10-unit
      // range. A second radial check from the avatar origin incorrectly
      // rejected valid hits near the end of the segment because the muzzle is
      // offset forward from the player state position.
      if (!target || target.presence !== "online") return;
      const shooterZone = this.mediaZoneBySessionId.get(client.sessionId)?.id ?? "public";
      const targetZone = this.mediaZoneBySessionId.get(shot.targetSessionId)?.id ?? "public";
      if (shooterZone !== targetZone) return;
      const targetX = target.x + this.world.width / 2;
      const targetZ = target.z + this.world.depth / 2;
      const rayX = end.x - start.x;
      const rayY = end.y - start.y;
      const rayZ = end.z - start.z;
      const rayLengthSq = rayX * rayX + rayY * rayY + rayZ * rayZ;
      if (rayLengthSq < 0.01) return;
      // Player state positions are authoritative but can trail the rendered
      // avatar by a network tick. Test the shot segment against a vertical
      // capsule around the state position (rather than a single XZ point), so
      // aiming at the torso and small replication delays still count as hits.
      const targetCenter = { x: targetX, y: 1, z: targetZ };
      const projection = ((targetCenter.x - start.x) * rayX + (targetCenter.y - start.y) * rayY + (targetCenter.z - start.z) * rayZ) / rayLengthSq;
      if (projection < 0 || projection > 1) return;
      const closestX = start.x + rayX * projection;
      const closestY = start.y + rayY * projection;
      const closestZ = start.z + rayZ * projection;
      const horizontalMiss = Math.hypot(targetX - closestX, targetZ - closestZ);
      const verticalMiss = Math.max(0, Math.abs(targetCenter.y - closestY) - 0.9);
      if (horizontalMiss > 1.6 || verticalMiss > 0.9) return;
      const username = this.usernamesBySessionId.get(client.sessionId) ?? "Someone";
      this.clients.find((recipient) => recipient.sessionId === shot.targetSessionId)?.send("blaster-hit", { shooterName: username });
    });
    this.onMessage("vehicle", (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || payload !== "") return;
      this.exitVehicle(client.sessionId, player);
      this.autoRoutes.delete(client.sessionId);
      this.pendingSitsBySessionId.delete(client.sessionId);
    });
    this.onMessage("vehicle-interact", (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (player.vehicleId) {
        this.autoRoutes.delete(client.sessionId);
        this.exitVehicle(client.sessionId, player);
        return;
      }
      if (player.status === "do-not-disturb" || player.status === "in-meeting") return;
      if (typeof payload !== "object" || payload === null || !("propId" in payload) || typeof payload.propId !== "string") return;
      const placed = this.mapLayout.props.find((item) => item.id === payload.propId);
      const vehicleId = placed && ROOM_PROP_CATALOG.find((entry) => entry.asset === placed.asset)?.vehicleId;
      if (!placed || !vehicleId || !KENNEY_VEHICLE_IDS.includes(vehicleId as (typeof KENNEY_VEHICLE_IDS)[number])) return;
      const occupied = [...this.state.players.entries()].some(([sessionId, other]) => sessionId !== client.sessionId && Boolean(other.vehicleId) && other.vehiclePropId === placed.id);
      const parked = [...this.state.players.values()].find((other) => other.vehiclePropId === placed.id && !other.vehicleId);
      const vehiclePosition = parked ? { x: parked.vehiclePropX, z: parked.vehiclePropZ } : { x: placed.x, z: placed.z };
      if (occupied || Math.hypot(player.x - vehiclePosition.x, player.z - vehiclePosition.z) > 3.6) {
        client.send("vehicle-interact-status", { status: occupied ? "occupied" : "too-far" });
        return;
      }
      player.vehiclePropId = placed.id;
      player.vehiclePropX = vehiclePosition.x;
      player.vehiclePropZ = vehiclePosition.z;
      player.vehiclePropRotation = parked?.vehiclePropRotation ?? placed.rotation;
      player.vehicleId = vehicleId;
      player.vehicleMode = "manual";
      // The parked vehicle remains in the saved map as a collidable prop. If it
      // also blocks its driver, forward/sideways movement starts inside its
      // footprint and gets rejected until the player reverses out of it.
      this.refreshVehicleCollisionWorlds();
      player.sittingPropId = "";
      player.dancing = false;
      this.pendingSitsBySessionId.delete(client.sessionId);
      player.rotation = player.vehiclePropRotation;
      // Manual driving remains mounted while idle. The player exits explicitly
      // through the vehicle interaction message.
      this.autoRoutes.delete(client.sessionId);
      const username = this.usernamesBySessionId.get(client.sessionId);
      if (username) void recordOfficeActivity(this.officeId, username, "vehicle.enter", vehicleId);
      client.send("vehicle-interact-status", { status: "entered", vehicleId });
    });
    this.onMessage("auto-move", (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.status === "do-not-disturb" || player.status === "in-meeting" || typeof payload !== "object" || payload === null || !("x" in payload) || !("z" in payload)) return;
      const { x, z } = payload as { x: unknown; z: unknown; randomVehicle?: unknown };
      if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) return;
      if (Math.abs(x) > this.world.width / 2 || Math.abs(z) > this.world.depth / 2) return;
      this.stopFollowing(client.sessionId, "stopped", false);
      player.sittingPropId = "";
      player.dancing = false;
      this.pendingSitsBySessionId.delete(client.sessionId);
      const previousVehicle = player.vehicleId;
      const previousVehicleMode = player.vehicleMode;
      const previousVehiclePropId = player.vehiclePropId;
      const randomVehicle = "randomVehicle" in payload && payload.randomVehicle === true;
      const start = { x: player.x, z: player.z };
      const destination = { x, z };
      const destinationZone = this.mapLayout.zones
        .filter((zone) => Math.abs(x - zone.x) <= zone.width / 2 && Math.abs(z - zone.z) <= zone.depth / 2)
        .sort((a, b) => a.width * a.depth - b.width * b.depth)[0];
      const sourceZone = this.mapLayout.zones
        .filter((zone) => Math.abs(start.x - zone.x) <= zone.width / 2 && Math.abs(start.z - zone.z) <= zone.depth / 2)
        .sort((a, b) => a.width * a.depth - b.width * b.depth)[0];
      const movingWithinSameRoom = Boolean(sourceZone && destinationZone && sourceZone.id === destinationZone.id);
      const occupiedSeatIds = new Set([...this.state.players.values()]
        .filter((other) => other.presence === "online" && Boolean(other.sittingPropId))
        .map((other) => other.sittingPropId));
      // Only auto-sit when entering a room. Clicking another point in the
      // room the player already occupies is an ordinary point-to-point move.
      const walkingWorld = player.vehicleId
        ? this.vehicleWorldsBySessionId.get(client.sessionId) ?? this.world
        : this.world;
      const walkToSeatRoute = destinationZone && !movingWithinSameRoom
        ? findSeatApproachRoute(start, destinationZone, this.mapLayout.props, walkingWorld, occupiedSeatIds, destination)
        : null;
      const shouldWalkToSeat = Boolean(walkToSeatRoute);
      // Auto-move vehicles are temporary. Interactively driven vehicles retain
      // their manual state and prop binding when an auto route is requested.
      let fastWalkFallback = false;
      if (randomVehicle && !movingWithinSameRoom && previousVehicleMode !== "manual") {
        const candidate = KENNEY_VEHICLE_IDS[Math.floor(Math.random() * KENNEY_VEHICLE_IDS.length)]!;
        const candidateWorld = { ...this.world, playerRadius: Math.max(this.world.playerRadius, 0.66) };
        if (isPositionWalkable({ x: player.x, z: player.z }, candidateWorld)) {
          player.vehicleId = candidate;
          player.vehicleMode = "auto";
          // Temporary auto-move cars are not parked map props. Do not inherit
          // a prop id left over from a vehicle the player exited earlier.
          player.vehiclePropId = "";
        } else fastWalkFallback = true;
      }
      const drivingToRoomSeat = shouldWalkToSeat && player.vehicleMode === "auto" && Boolean(player.vehicleId);
      const routeWorld = shouldWalkToSeat && !drivingToRoomSeat
        ? walkingWorld
        : player.vehicleId
        ? { ...this.world, playerRadius: Math.max(this.world.playerRadius, 0.66) }
        : this.world;
      const seatRoute = shouldWalkToSeat && !drivingToRoomSeat ? walkToSeatRoute : null;
      const navigationWorld = this.ghostModeBySessionId.get(client.sessionId) ? ghostCollisionWorld(routeWorld) : routeWorld;
      let points = seatRoute?.points ?? findAutoRoute(start, destination, navigationWorld);
      if (!points && randomVehicle && player.vehicleMode === "auto") {
        // The vehicle cannot reach this destination. Exit cleanly and retry
        // the same route on foot at the explicit fast fallback speed.
        this.exitVehicle(client.sessionId, player);
        fastWalkFallback = true;
        points = findAutoRoute(start, destination, this.world);
      }
      if (!points) {
        const lockedDestination = Boolean(destinationZone && this.lockedZoneIds.has(destinationZone.id) && sourceZone?.id !== destinationZone.id);
        const landing = !lockedDestination && randomVehicle ? autoMoveLandingPoint(destination, this.world, destinationZone) : null;
        if (landing) {
          if (player.vehicleId) this.exitVehicle(client.sessionId, player);
          player.x = landing.x;
          player.z = landing.z;
          player.sittingPropId = "";
          player.dancing = false;
          this.autoRoutes.delete(client.sessionId);
          this.pendingSitsBySessionId.delete(client.sessionId);
          this.seatApproachWorldsBySessionId.delete(client.sessionId);
          this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
          this.updateMeetingMembership();
          this.updatePrivateMembership();
          this.updateProximity();
          client.send("auto-move-status", { status: "arrived", teleported: true });
          return;
        }
        player.vehicleId = previousVehicle;
        player.vehicleMode = previousVehicleMode;
        player.vehiclePropId = previousVehiclePropId;
        client.send("auto-move-status", { status: "unreachable" });
        return;
      }
      // Only leave a manually driven or temporary vehicle after we know the
      // requested chair has a valid walkable route.
      if (seatRoute && player.vehicleId) {
        if (previousVehiclePropId) this.seatApproachWorldsBySessionId.set(client.sessionId, { world: walkingWorld, propId: previousVehiclePropId });
        this.exitVehicle(client.sessionId, player);
      }
      this.autoRoutes.set(client.sessionId, {
        points,
        index: 0,
        stalledTicks: 0,
        destination,
        ...(fastWalkFallback ? { fastWalkFallback: true } : {}),
        ...(seatRoute ? { sitOnArrivalPropId: seatRoute.propId, sitOnArrivalZoneId: seatRoute.zoneId } : {}),
        ...(drivingToRoomSeat && destinationZone ? { sitOnArrivalZoneId: destinationZone.id } : {}),
      });
      this.pendingSitsBySessionId.delete(client.sessionId);
      this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
      if (randomVehicle && !previousVehicle && player.vehicleId) {
        const username = this.usernamesBySessionId.get(client.sessionId);
        if (username) void recordOfficeActivity(this.officeId, username, "vehicle.enter", player.vehicleId);
      }
      client.send("auto-move-status", { status: "started", randomVehicle: randomVehicle && Boolean(player.vehicleId), vehicleId: player.vehicleId, fastWalkFallback });
    });
    this.onMessage("ghost-mode", (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || typeof payload !== "object" || payload === null || !("enabled" in payload) || typeof payload.enabled !== "boolean") return;
      const enabled = payload.enabled;
      if (enabled && (player.status === "do-not-disturb" || player.status === "in-meeting")) return;
      this.ghostModeBySessionId.set(client.sessionId, enabled);
      if (enabled && this.autoRoutes.delete(client.sessionId)) {
        this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
        if (player.vehicleMode === "auto") this.exitVehicle(client.sessionId, player);
        client.send("auto-move-status", { status: "cancelled" });
      }
      this.broadcastGhostMode(client.sessionId, enabled);
    });
    this.onMessage("follow-player", (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.status === "do-not-disturb" || player.status === "in-meeting") return;
      if (typeof payload !== "object" || payload === null || !("targetSessionId" in payload) || typeof payload.targetSessionId !== "string") return;
      this.startFollowing(client.sessionId, payload.targetSessionId);
    });
    this.onMessage("follow-stop", (client: Client) => this.stopFollowing(client.sessionId, "stopped"));
    this.onMessage("follow-cancel", (client: Client, payload: unknown) => {
      if (typeof payload !== "object" || payload === null || !("followerSessionId" in payload) || typeof payload.followerSessionId !== "string") return;
      if (this.activeFollowsBySessionId.get(payload.followerSessionId)?.targetSessionId === client.sessionId) {
        this.stopFollowing(payload.followerSessionId, "cancelled");
      }
    });
    this.onMessage("wave", (client: Client, payload: unknown) => {
      const initiatingPlayer = this.state.players.get(client.sessionId);
      if (!initiatingPlayer || initiatingPlayer.status === "do-not-disturb" || initiatingPlayer.status === "in-meeting") return;
      if (typeof payload !== "object" || payload === null || !("targetSessionId" in payload) || typeof payload.targetSessionId !== "string" || payload.targetSessionId === client.sessionId) return;
      const target = this.state.players.get(payload.targetSessionId);
      if (!target || target.presence !== "online") return;
      const now = performance.now();
      if (now - (this.lastWaveAtBySessionId.get(client.sessionId) ?? 0) < 900) return;
      this.lastWaveAtBySessionId.set(client.sessionId, now);
      const sender = this.state.players.get(client.sessionId);
      const senderClient = this.clients.find((entry) => entry.sessionId === client.sessionId);
      const targetClient = this.clients.find((entry) => entry.sessionId === payload.targetSessionId);
      targetClient?.send("wave-notification", {
        senderSessionId: client.sessionId,
        senderName: sender?.displayName || this.usernamesBySessionId.get(client.sessionId) || "Someone",
      });
      senderClient?.send("wave-status", { status: "sent", targetName: target.displayName });
    });
    this.onMessage("auto-move-to-player", (client: Client, payload: unknown) => {
      if (typeof payload !== "object" || payload === null || !("targetSessionId" in payload) || typeof payload.targetSessionId !== "string") return;
      const follower = this.state.players.get(client.sessionId);
      const target = this.state.players.get(payload.targetSessionId);
      if (!follower || follower.status === "do-not-disturb" || follower.status === "in-meeting" || !target || target.presence !== "online" || client.sessionId === payload.targetSessionId || follower.vehicleMode === "manual") {
        client.send("auto-move-status", { status: "unreachable" });
        return;
      }
      this.stopFollowing(client.sessionId, "stopped", false);
      const destination = this.followApproachPoint(client.sessionId, follower, target);
      const routeWorld = follower.vehicleId ? { ...this.world, playerRadius: Math.max(this.world.playerRadius, 0.66) } : this.world;
      const points = findAutoRoute({ x: follower.x, z: follower.z }, destination, routeWorld);
      if (!points) { client.send("auto-move-status", { status: "unreachable" }); return; }
      this.autoRoutes.set(client.sessionId, { points, index: 0, stalledTicks: 0 });
      this.pendingSitsBySessionId.delete(client.sessionId);
      this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
      client.send("auto-move-status", { status: "started" });
    });
    this.onMessage("auto-move-cancel", (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.stopFollowing(client.sessionId, "stopped", false);
      this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
      this.pendingSitsBySessionId.delete(client.sessionId);
      if (this.autoRoutes.delete(client.sessionId)) {
        client.send("auto-move-status", { status: "cancelled" });
        if (player.vehicleMode === "auto") this.exitVehicle(client.sessionId, player);
      }
    });
    this.onMessage("input", (client: Client, payload: unknown) => {
      const now = performance.now();
      const lastPacket = this.lastPacketAt.get(client.sessionId) ?? 0;
      if (now - lastPacket < INPUT_MIN_INTERVAL_MS) return;
      this.lastPacketAt.set(client.sessionId, now);

      if (!isValidMovementInput(payload)) return;
      const player = this.state.players.get(client.sessionId);
      if (player?.status === "do-not-disturb" || player?.status === "in-meeting") {
        this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: now });
        return;
      }
      this.movementInputs.set(client.sessionId, { x: payload.x, z: payload.z, sprint: payload.sprint === true, facingYaw: payload.facingYaw, receivedAt: now });
      if (payload.x !== 0 || payload.z !== 0) {
        const player = this.state.players.get(client.sessionId);
        if (player) {
          player.sittingPropId = "";
          player.dancing = false;
        }
        this.stopFollowing(client.sessionId, "stopped");
        if (this.autoRoutes.delete(client.sessionId)) {
          client.send("auto-move-status", { status: "cancelled" });
          const player = this.state.players.get(client.sessionId);
          if (player?.vehicleMode === "auto") this.exitVehicle(client.sessionId, player);
        }
      }
      const username = this.usernamesBySessionId.get(client.sessionId);
      const lastActivityRefreshAt = this.activityRefreshAtBySessionId.get(client.sessionId) ?? 0;
      if (username && now - lastActivityRefreshAt >= activityRefreshIntervalMs) {
        // Movement arrives around 20 times per second. Refresh presence at
        // most once per minute per session; the persistence helpers apply
        // longer per-user/per-office write intervals on top of this guard.
        this.activityRefreshAtBySessionId.set(client.sessionId, now);
        void markUserActive(username).catch(() => console.warn("Could not refresh account activity."));
        void markOfficeActive(this.officeId).catch(() => console.warn("Could not refresh office activity."));
      }
    });

    this.setFixedTimestep((context) => this.step(context.dt), 20);
  }

  async onAuth(client: Client, options: { officeId?: string }, context: AuthContext) {
    const origin = context.headers.get("origin");
    const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173").split(",").map((value) => value.trim());
    if (!origin || !allowedOrigins.includes(origin)) throw new Error("Origin is not allowed.");
    const cookie = context.headers.get("cookie") ?? "";
    const sessionToken = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("gv_session="))?.slice("gv_session=".length);
    const session = await getSession(sessionToken);
    if (!session) throw new Error("Authentication required. Please sign in.");
    if (!session.characterId) throw new Error("Choose your character before entering the office.");
    if (!options.officeId) throw new Error("Choose an office before joining.");
    const role = await getOfficeRole(session.username, options.officeId, session.role === "maintainer");
    if (!role) throw new Error("You need an invitation to join this office.");
    const identity = liveKitIdentity(session.username, sessionToken!);
    await markUserActive(session.username);
    await markOfficeActive(options.officeId);
    // One avatar per username in an office room. A fresh connection replaces a
    // stale tab/session; reconnects keep the same Colyseus session id.
    const activeSessionId = this.sessionSecurity.activeSession(session.username);
    const existingSessionIds = new Set([
      ...(activeSessionId ? [activeSessionId] : []),
      ...[...this.state.players.entries()].filter(([sessionId, player]) => sessionId !== client.sessionId && player.username === session.username).map(([sessionId]) => sessionId),
    ]);
    this.sessionSecurity.activate(session.username, client.sessionId, sessionToken);
    for (const existingSessionId of existingSessionIds) {
      if (existingSessionId !== client.sessionId) this.replaceSession(existingSessionId, client, session.username);
    }
    return { ...session, officeId: options.officeId, roomKey: "lobby", officeRole: role, mediaIdentity: identity };
  }

  private replaceSession(existingSessionId: string, client: Client, username: string) {
    // Invalidate the reserved token before removing its player. Core owns the
    // seat cleanup; a late resume must not resurrect the replaced session.
    this.revokeSpotlightSession(existingSessionId, "replace");
    this.sessionSecurity.cancelSeat(existingSessionId, REPLACED_SESSION_REASON);
    logServerEvent("realtime", "office.session.replaced", { roomId: this.roomId, officeId: this.officeId, username, replacedSessionId: existingSessionId, replacementSessionId: client.sessionId });
    this.clients.find((existing) => existing.sessionId === existingSessionId)?.leave(REPLACED_SESSION_CLOSE_CODE, REPLACED_SESSION_REASON);
    this.broadcastGhostMode(existingSessionId, false);
    this.state.players.delete(existingSessionId);
    this.vehicleWorldsBySessionId.delete(existingSessionId);
    this.refreshVehicleCollisionWorlds();
    this.clearSessionState(existingSessionId);
    this.sessionSecurity.finish(username, existingSessionId);
  }

  private broadcastGhostMode(sessionId: string, enabled: boolean) {
    const payload = { sessionId, enabled };
    for (const client of this.clients) client.send("ghost-mode-status", payload);
  }

  onJoin(client: Client, _options: unknown, auth: { username: string; nickname?: string | null; mediaIdentity: string; characterId: string | null; officeRole: string }) {
    const spawn = findSafeSpawn(
      [...this.state.players.values()].map((player) => ({ x: player.x, z: player.z })),
      this.world,
    );
    const player = new PlayerState();
    player.x = spawn.x;
    player.z = spawn.z;
    player.rotation = 0;
    player.worldVersion = this.worldVersion;
    player.username = auth.username;
    player.displayName = auth.nickname?.trim() || auth.username;
    player.characterId = auth.characterId ?? DEFAULT_CHARACTER_ID;
    player.petId = "";
    player.vehicleId = "";
    player.vehicleMode = "";
    this.vehicleWorldsBySessionId.delete(client.sessionId);
    player.vehiclePropId = "";
    player.vehiclePropX = spawn.x;
    player.vehiclePropZ = spawn.z;
    player.vehiclePropRotation = 0;
    player.sittingPropId = "";
    player.dancing = false;
    player.weaponId = "";
    player.status = "available";
    player.presence = "online";
    this.state.players.set(client.sessionId, player);
    this.usernamesBySessionId.set(client.sessionId, auth.username);
    this.officeRolesBySessionId.set(client.sessionId, auth.officeRole);
    this.sessionSecurity.activate(auth.username, client.sessionId);
    this.mediaIdentityBySessionId.set(client.sessionId, auth.mediaIdentity);
    this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
    this.ghostModeBySessionId.set(client.sessionId, false);
    this.autoRoutes.delete(client.sessionId);
    this.pendingSitsBySessionId.delete(client.sessionId);
    client.send("office-map", { config: this.mapConfig });
    client.send("map-edit-lock", { editorUsername: this.mapEditorUsername });
    client.send("ghost-mode-status", { sessionId: client.sessionId, enabled: false });
    void recordOfficeActivity(this.officeId, auth.username, "office.join");
    this.updateMeetingMembership();
    this.updatePrivateMembership();
    this.updateProximity();
    logServerEvent("realtime", "office.client.joined", { roomId: this.roomId, officeId: this.officeId, sessionId: client.sessionId, username: auth.username, clientCount: this.clients.length });
  }

  private prepareSessionDeparture(sessionId: string, player: PlayerState | undefined) {
    if (player) {
      player.presence = "away";
      if (shouldClearHandRaise(this.mediaZoneBySessionId.get(sessionId)?.id ?? "", "", false)) player.handRaised = false;
    }
    this.stopFollowing(sessionId, "stopped");
    for (const [followerSessionId, follow] of this.activeFollowsBySessionId) {
      if (follow.targetSessionId === sessionId) this.stopFollowing(followerSessionId, "target-left");
    }
  }

  private logSessionDrop(client: DropDiagnosticClient, code?: number) {
    logServerEvent("realtime", "office.client.dropped", { roomId: this.roomId, officeId: this.officeId, sessionId: client.sessionId, username: this.usernamesBySessionId.get(client.sessionId), code, clientCount: this.clients.length,
      messageCount: client._numMessagesLastSecond, messageCountResetsAtMs: client._messageCountResetsAt,
      lastMessageTimeMs: client._lastMessageTime, roomClockTimeMs: this.clock.currentTime, roomClockDeltaMs: this.clock.deltaTime,
      messageLimitPerSecond: this.maxMessagesPerSecond,
      rateLimitExceeded: (client._numMessagesLastSecond ?? INITIAL_MESSAGE_COUNT) > this.maxMessagesPerSecond });
  }

  onBeforeShutdown() {
    this.shuttingDown = true;
    super.onBeforeShutdown();
  }

  onDrop(client: DropDiagnosticClient, code?: number) {
    const player = this.state.players.get(client.sessionId);
    this.logSessionDrop(client, code);
    if (this.shuttingDown) return;
    const username = this.usernamesBySessionId.get(client.sessionId);
    if (!username || this.sessionSecurity.activeSession(username) !== client.sessionId) return;
    const reason = spotlightDepartureReason(code, "drop");
    this.revokeSpotlightSession(client.sessionId, reason);
    if (reason === SECURITY_DEPARTURE_LABEL || !this.sessionSecurity.canReconnect(username, client.sessionId, { accountActive: true, officeMember: true, playerExists: !!player })) return;
    this.prepareSessionDeparture(client.sessionId, player);
    this.movementInputs.delete(client.sessionId);
    this.autoRoutes.delete(client.sessionId);
    this.pendingSitsBySessionId.delete(client.sessionId);
    if (player?.vehicleMode === "auto") this.exitVehicle(client.sessionId, player);
    this.lastPacketAt.delete(client.sessionId);
    this.proximityBySessionId.delete(client.sessionId);
    this.updateMeetingMembership();
    this.updatePrivateMembership();
    this.updateProximity();
    const reconnection = this.allowReconnection(client, RECONNECTION_SEAT_TIMEOUT_SECONDS);
    trackReconnectionSeat(reconnection, this.sessionSecurity, username, { roomId: this.roomId, officeId: this.officeId, sessionId: client.sessionId });
  }

  async onReconnect(client: Client) {
    const username = this.usernamesBySessionId.get(client.sessionId);
    const access = await readReconnectAccess(username, this.sessionSecurity.token(client.sessionId), this.officeId, { account: getSession, officeRole: getOfficeRole });
    if (access.error) logServerError("realtime", RECONNECT_ACCESS_FAILED_EVENT_LABEL, access.error, { officeId: this.officeId, sessionId: client.sessionId });
    if (!username || !this.sessionSecurity.canReconnect(username, client.sessionId, {
      ...access,
      playerExists: this.state.players.has(client.sessionId),
    })) {
      this.revokeSpotlightSession(client.sessionId, SECURITY_DEPARTURE_LABEL);
      client.leave(OFFICE_ACCESS_REVOKED_CLOSE_CODE, OFFICE_ACCESS_REVOKED_REASON);
      return;
    }
    const player = this.state.players.get(client.sessionId);
    if (player) {
      if (player.worldVersion !== this.worldVersion) {
        const spawn = findSafeSpawn(
          [...this.state.players.entries()]
            .filter(([sessionId]) => sessionId !== client.sessionId)
            .map(([, other]) => ({ x: other.x, z: other.z })),
          this.world,
        );
        player.x = spawn.x;
        player.z = spawn.z;
        player.rotation = 0;
        player.worldVersion = this.worldVersion;
      }
      player.presence = "online";
    }
    this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
    this.autoRoutes.delete(client.sessionId);
    this.pendingSitsBySessionId.delete(client.sessionId);
    this.lastPacketAt.delete(client.sessionId);
    this.ghostModeBySessionId.delete(client.sessionId);
    this.lastJumpAtBySessionId.delete(client.sessionId);
    this.broadcastGhostMode(client.sessionId, false);
    client.send("proximity", { sessionIds: [] });
    this.updateMeetingMembership();
    this.updatePrivateMembership();
    this.updateProximity();
    logServerEvent("realtime", "office.client.reconnected", { roomId: this.roomId, officeId: this.officeId, sessionId: client.sessionId, username: this.usernamesBySessionId.get(client.sessionId), clientCount: this.clients.length });
  }

  onLeave(client: Client, code?: number) {
    const username = this.usernamesBySessionId.get(client.sessionId);
    logServerEvent("realtime", "office.client.left", { roomId: this.roomId, officeId: this.officeId, sessionId: client.sessionId, username, code, clientCount: this.clients.length });
    this.releaseMapEditLock(client.sessionId);
    this.broadcastGhostMode(client.sessionId, false);
    const player = this.state.players.get(client.sessionId);
    this.revokeSpotlightSession(client.sessionId, spotlightDepartureReason(code, "leave"));
    this.prepareSessionDeparture(client.sessionId, player);
    this.updateMeetingMembership();
    // A disconnect is also a room exit. Process it while the departing
    // session is still registered so the remaining room occupants get the
    // same presence cue as when someone walks out.
    this.updatePrivateMembership();
    this.updateProximity();
    this.state.players.delete(client.sessionId);
    this.vehicleWorldsBySessionId.delete(client.sessionId);
    this.refreshVehicleCollisionWorlds();
    this.lastPacketAt.delete(client.sessionId);
    this.activityRefreshAtBySessionId.delete(client.sessionId);
    this.lastBlasterShotAtBySessionId.delete(client.sessionId);
    this.lastWaveAtBySessionId.delete(client.sessionId);
    this.lastJumpAtBySessionId.delete(client.sessionId);
    if (this.meetingMembersBySessionId.has(client.sessionId)) {
      const identity = this.mediaIdentityBySessionId.get(client.sessionId);
      if (identity) void revokeMeetingParticipant(this.officeId, this.roomKey, identity).catch(() => console.warn("Could not revoke meeting audio participant."));
    }
    if (username) void recordOfficeActivity(this.officeId, username, "office.leave");
    this.clearSessionState(client.sessionId);
    this.sessionSecurity.finish(username, client.sessionId);
    for (const nearby of this.proximityBySessionId.values()) nearby.delete(client.sessionId);
  }

  private clearSessionState(sessionId: string) {
    const collections = [
      this.usernamesBySessionId, this.officeRolesBySessionId, this.movementInputs,
      this.ghostModeBySessionId, this.autoRoutes, this.pendingSitsBySessionId,
      this.proximityBySessionId, this.proximityGroupBySessionId, this.meetingMembersBySessionId,
      this.privateZoneIdBySessionId, this.mediaZoneBySessionId, this.mediaIdentityBySessionId,
    ];
    for (const collection of collections) collection.delete(sessionId);
  }

  private revokeSpotlightSession(sessionId: string, reason: SpotlightDeparture, revokedSpotlights?: Set<Spotlight>) {
    const username = this.usernamesBySessionId.get(sessionId);
    if (!username) return;
    if (reason === SECURITY_DEPARTURE_LABEL ? !this.sessionSecurity.revoke(sessionId) : this.sessionSecurity.isRevoked(sessionId)) return;
    if (this.spotlight && revokedSpotlights?.has(this.spotlight)) return;
    if (this.spotlight) revokedSpotlights?.add(this.spotlight);
    void this.spotlight?.depart(username, reason).catch((error) => {
      logServerError("realtime", "spotlight.revoke.failed", error, { officeId: this.officeId });
    });
  }

  static getSpotlight(officeId: string, username: string, identity: string) {
    const rooms = [...(OfficeRoom.roomsByOffice.get(officeId) ?? [])];
    return rooms.find((room) =>
      [...room.usernamesBySessionId].some(
        ([sessionId, user]) => user === username && !room.sessionSecurity.isRevoked(sessionId) &&
          room.sessionSecurity.activeSession(user) === sessionId && room.mediaIdentityBySessionId.get(sessionId) === identity,
      ),
    )?.spotlight;
  }

  onDispose() {
    const rooms = OfficeRoom.roomsByOffice.get(this.officeId);
    const lastRoom = rooms?.size === 1 && rooms.has(this);
    const peers = [...(rooms ?? [])].filter(room => room !== this).map(room => room.sessionSecurity);
    const departingUsernames = disposedRoomSpotlightUsernames(this.usernamesBySessionId.values(), peers, lastRoom ? undefined : this.spotlight?.snapshot().usernames ?? []);
    if (this.sessionSecurity.close() && (lastRoom || departingUsernames.length > 0)) {
      void this.spotlight?.departSecurity(departingUsernames).catch((error) =>
        logServerError("realtime", SPOTLIGHT_CLOSE_FAILED_EVENT_LABEL, error, { officeId: this.officeId }));
    }
    unregisterSocialMessages(this, this.officeId, false);
    logServerEvent("realtime", "office.room.disposed", { roomId: this.roomId, officeId: this.officeId, remainingClients: this.clients.length });
    rooms?.delete(this);
    if (rooms?.size === 0) OfficeRoom.roomsByOffice.delete(this.officeId);
  }

  private releaseMapEditLock(sessionId: string) {
    if (this.mapEditorSessionId !== sessionId) return;
    this.mapEditorSessionId = null;
    this.mapEditorUsername = null;
    this.broadcast("map-edit-lock", { editorUsername: null });
  }

  private revokeUsername(username: string, reason: string, revokedSpotlights: Set<Spotlight>) {
    let kickedClientCount = 0;
    for (const [sessionId, memberUsername] of this.usernamesBySessionId) {
      if (memberUsername !== username) continue;
      this.revokeSpotlightSession(sessionId, SECURITY_DEPARTURE_LABEL, revokedSpotlights);
      const client = this.clients.find((candidate) => candidate.sessionId === sessionId);
      if (client) { client.leave(OFFICE_ACCESS_REVOKED_CLOSE_CODE, reason); kickedClientCount += 1; }
    }
    return kickedClientCount;
  }

  static kickMember(officeId: string, username: string) {
    const revokedSpotlights = new Set<Spotlight>();
    for (const room of OfficeRoom.roomsByOffice.get(officeId) ?? []) room.revokeUsername(username, OFFICE_ACCESS_REVOKED_REASON, revokedSpotlights);
  }

  static kickAccountFromAllOffices(username: string) {
    const revokedSpotlights = new Set<Spotlight>();
    let kickedClientCount = 0;
    for (const rooms of OfficeRoom.roomsByOffice.values()) {
      for (const room of rooms) kickedClientCount += room.revokeUsername(username, ACCOUNT_SUSPENDED_REASON_LABEL, revokedSpotlights);
    }
    return kickedClientCount;
  }

  static closeOffice(officeId: string) {
    const spotlights = new Set<Spotlight>();
    for (const room of OfficeRoom.roomsByOffice.get(officeId) ?? []) {
      if (room.sessionSecurity.close() && room.spotlight) spotlights.add(room.spotlight);
      for (const client of [...room.clients]) client.leave(OFFICE_CLOSED_CLOSE_CODE, OFFICE_DELETED_REASON_LABEL);
    }
    for (const spotlight of spotlights) {
      void spotlight.close().catch((error) => logServerError("realtime", SPOTLIGHT_CLOSE_FAILED_EVENT_LABEL, error, { officeId }));
    }
  }

  static async updateMap(officeId: string) {
    const rooms = OfficeRoom.roomsByOffice.get(officeId) ?? new Set<OfficeRoom>();
    logServerEvent("realtime", "office.map.refresh.started", { officeId, roomCount: rooms.size });
    const result = await database?.query<{ config: unknown; office_props: unknown | null }>(
      `SELECT maps.config, office_props.props AS office_props
       FROM app_offices offices
       LEFT JOIN app_office_map_layouts maps ON maps.office_id = offices.id
       LEFT JOIN app_office_props office_props ON office_props.office_id = offices.id
       WHERE offices.id = $1`, [officeId],
    );
    const rawConfig = result?.rows[0]?.config ?? { version: 1, layout: { version: 1, props: [], zones: [], walls: [], doors: [] } };
    const config = OfficeRoom.mergeSavedProps(rawConfig, result?.rows[0]?.office_props ?? null);
    for (const room of rooms) room.applyMapConfig(config);
    logServerEvent("realtime", "office.map.refresh.completed", { officeId, roomCount: rooms.size });
  }

  static updateDeskZone(officeId: string, update: { id: string; name: string; ownerUsername: string | null }) {
    const rooms = OfficeRoom.roomsByOffice.get(officeId) ?? new Set<OfficeRoom>();
    for (const room of rooms) room.applyDeskZoneUpdate(update);
    logServerEvent("realtime", "office.desk-zone.updated", { officeId, zoneId: update.id, ownerUsername: update.ownerUsername, roomCount: rooms.size });
  }

  private applyDeskZoneUpdate(update: { id: string; name: string; ownerUsername: string | null }) {
    const zone = this.mapLayout.zones.find((entry) => entry.id === update.id && entry.kind === "private");
    if (!zone) return;
    const nextZone: RoomLayoutZone = { ...zone, name: update.name };
    if (update.ownerUsername) nextZone.ownerUsername = update.ownerUsername;
    else delete nextZone.ownerUsername;
    this.mapLayout = { ...this.mapLayout, zones: this.mapLayout.zones.map((entry) => entry.id === update.id ? nextZone : entry) };
    const config = typeof this.mapConfig === "object" && this.mapConfig !== null && "layout" in this.mapConfig
      ? this.mapConfig as { version?: number; layout?: RoomLayout }
      : { version: 1, layout: this.mapLayout };
    this.mapConfig = { ...config, layout: this.mapLayout };
    for (const [sessionId, currentZone] of this.mediaZoneBySessionId) {
      if (currentZone.id !== update.id) continue;
      this.mediaZoneBySessionId.set(sessionId, nextZone);
      const client = this.clients.find((entry) => entry.sessionId === sessionId);
      if (client) this.sendMediaZone(client, sessionId);
    }
    this.broadcast("desk-zone-updated", { zoneId: update.id, name: update.name, ownerUsername: update.ownerUsername });
  }

  private static mergeSavedProps(config: unknown, rawProps: unknown | null) {
    if (rawProps === null) return config;
    const parsed = readRoomLayout({ layout: { props: rawProps } });
    const current = readRoomLayout(config);
    return { version: 1, layout: { ...current, props: parsed.props } };
  }

  private applyMapConfig(config: unknown) {
    const nextLayout = readRoomLayout(config);
    const worldGeometryChanged = worldGeometrySignature(this.mapLayout) !== worldGeometrySignature(nextLayout);
    this.mapConfig = config;
    this.mapLayout = nextLayout;
    this.refreshVehicleCollisionWorlds();
    if (worldGeometryChanged) this.worldVersion += 1;
    this.lockedZoneIds = new Set([...this.lockedZoneIds].filter((id) => this.mapLayout.zones.some((zone) => zone.id === id)));
    let relocatedPlayers = 0;
    for (const [sessionId, player] of this.state.players) {
      if (worldGeometryChanged) player.worldVersion = this.worldVersion;
      if (player.sittingPropId && !this.mapLayout.props.some((prop) => {
        const seat = parseRoomPropSeatReference(player.sittingPropId);
        return prop.id === seat.propId && roomPropSeatAnchors(prop).some((anchor) => anchor.index === seat.seatIndex);
      })) player.sittingPropId = "";
      const pendingSit = this.pendingSitsBySessionId.get(sessionId);
      if (pendingSit && !this.mapLayout.props.some((prop) => {
        const seat = parseRoomPropSeatReference(pendingSit.propId);
        return prop.id === seat.propId && roomPropSeatAnchors(prop).some((anchor) => anchor.index === seat.seatIndex);
      })) this.pendingSitsBySessionId.delete(sessionId);
      if (worldGeometryChanged && !isPositionWalkable({ x: player.x, z: player.z }, this.world)) {
        const spawn = findSafeSpawn(
          [...this.state.players.entries()].filter(([otherId]) => otherId !== sessionId).map(([, other]) => ({ x: other.x, z: other.z })),
          this.world,
        );
        player.x = spawn.x;
        player.z = spawn.z;
        relocatedPlayers += 1;
      }
    }
    logServerEvent("realtime", "office.map.applied", { roomId: this.roomId, officeId: this.officeId, worldGeometryChanged, worldVersion: this.worldVersion, playerCount: this.state.players.size, relocatedPlayers });
    this.broadcast("office-map", { config });
    this.updatePrivateMembership();
    this.updateProximity();
  }

  /** Keep collision footprints aligned with movable vehicle props in the scene. */
  private refreshVehicleCollisionWorlds() {
    const movedProps = new Map<string, { x: number; z: number; rotation: number }>();
    for (const player of this.state.players.values()) {
      if (!player.vehiclePropId) continue;
      movedProps.set(player.vehiclePropId, {
        x: player.vehiclePropX,
        z: player.vehiclePropZ,
        rotation: player.vehiclePropRotation,
      });
    }

    this.world = campusWorldFromConfig(this.mapConfig, new Set(), movedProps);
    for (const [sessionId, player] of this.state.players) {
      if (player.vehicleId && player.vehiclePropId) {
        this.vehicleWorldsBySessionId.set(sessionId, campusWorldFromConfig(this.mapConfig, new Set([player.vehiclePropId]), movedProps));
      } else {
        this.vehicleWorldsBySessionId.delete(sessionId);
      }
    }
  }

  private updateMeetingMembership() {
    this.updatePrivateMembership();
  }

  static isMeetingMember(officeId: string, username: string, identity: string, roomKey = "lobby") {
    for (const room of OfficeRoom.roomsByOffice.get(officeId) ?? []) {
      for (const [sessionId, memberUsername] of room.usernamesBySessionId) {
        if (memberUsername === username && room.mediaIdentityBySessionId.get(sessionId) === identity && room.meetingMembersBySessionId.has(sessionId) && (roomKey === "lobby" || room.mediaZoneBySessionId.get(sessionId)?.id === roomKey)) return true;
      }
    }
    return false;
  }

  static getProximityGroupId(officeId: string, username: string, identity: string) {
    for (const room of OfficeRoom.roomsByOffice.get(officeId) ?? []) {
      for (const [sessionId, memberUsername] of room.usernamesBySessionId) {
        if (memberUsername === username && room.mediaIdentityBySessionId.get(sessionId) === identity) {
          const groupId = room.proximityGroupBySessionId.get(sessionId);
          if (groupId) return groupId;
        }
      }
    }
    return null;
  }

  static getPrivateVoiceZoneId(officeId: string, username: string, identity: string) {
    for (const room of OfficeRoom.roomsByOffice.get(officeId) ?? []) {
      for (const [sessionId, memberUsername] of room.usernamesBySessionId) {
        if (memberUsername === username && room.mediaIdentityBySessionId.get(sessionId) === identity) {
          return room.privateZoneIdBySessionId.get(sessionId) ?? null;
        }
      }
    }
    return null;
  }

  private updatePrivateMembership() {
    const roomTransitions: MediaZoneTransition[] = [];
    for (const [sessionId, player] of this.state.players) {
      roomTransitions.push(...this.updatePlayerMediaZone(sessionId, player));
    }
    for (const transition of roomTransitions) this.notifyMediaZoneTransition(transition);
    // A lock belongs to active occupants; clear it once the last occupant leaves.
    const previousLocks = this.lockedZoneIds.size;
    this.lockedZoneIds = new Set([...this.lockedZoneIds].filter((zoneId) =>
      [...this.mediaZoneBySessionId.values()].some((zone) => zone.id === zoneId),
    ));
    if (this.lockedZoneIds.size !== previousLocks) this.broadcast("zone-locks", { zoneIds: [...this.lockedZoneIds] });
  }

  private updatePlayerMediaZone(sessionId: string, player: PlayerState): MediaZoneTransition[] {
    const previous = this.mediaZoneBySessionId.get(sessionId) ?? null;
    const current = player.presence === "online" ? roomLayoutZoneAt({ x: player.x, z: player.z }, this.mapConfig, previous?.id) : null;
    if (previous?.id === current?.id) return [];
    if (shouldClearHandRaise(previous?.id ?? "", current?.id ?? "", player.presence === "online")) player.handRaised = false;
    const transitions: MediaZoneTransition[] = [];
    if (previous) {
      transitions.push({ sessionId, zone: previous, direction: "exit" });
      this.exitMediaZone(sessionId, previous);
    }
    this.meetingMembersBySessionId.delete(sessionId);
    this.privateZoneIdBySessionId.delete(sessionId);
    if (current) {
      transitions.push({ sessionId, zone: current, direction: "enter" });
      this.mediaZoneBySessionId.set(sessionId, current);
      if (current.kind === "meeting") this.meetingMembersBySessionId.add(sessionId);
      else this.privateZoneIdBySessionId.set(sessionId, current.id);
      this.recordMediaZoneActivity(sessionId, current, "enter");
    } else this.mediaZoneBySessionId.delete(sessionId);
    const client = this.clients.find((entry) => entry.sessionId === sessionId);
    if (client) this.sendMediaZone(client, sessionId);
    return transitions;
  }

  private exitMediaZone(sessionId: string, zone: RoomLayoutZone) {
    const identity = this.mediaIdentityBySessionId.get(sessionId);
    if (identity) {
      const revocation = zone.kind === "meeting"
        ? revokeMeetingParticipant(this.officeId, zone.id, identity)
        : revokePrivateVoiceParticipant(this.officeId, zone.id, identity);
      void revocation.catch(() => console.warn("Could not revoke zone media participant."));
    }
    this.recordMediaZoneActivity(sessionId, zone, "exit");
  }

  private recordMediaZoneActivity(sessionId: string, zone: RoomLayoutZone, direction: "enter" | "exit") {
    const username = this.usernamesBySessionId.get(sessionId);
    if (!username) return;
    const activityType = zone.kind === "meeting"
      ? direction === "enter" ? "meeting.enter" : "meeting.leave"
      : direction === "enter" ? "private.enter" : "private.leave";
    void recordOfficeActivity(this.officeId, username, activityType, zone.name);
  }

  private notifyMediaZoneTransition(transition: MediaZoneTransition) {
    // Notify after membership updates. Entrants hear their own arrival too.
    if (transition.direction === "enter") {
      this.clients.find((client) => client.sessionId === transition.sessionId)?.send("room-presence", {
        direction: "enter",
        displayName: this.state.players.get(transition.sessionId)?.displayName ?? "Someone",
        zoneId: transition.zone.id,
      });
    }
    for (const [occupantSessionId, occupantZone] of this.mediaZoneBySessionId) {
      if (occupantSessionId === transition.sessionId || occupantZone.id !== transition.zone.id) continue;
      this.clients.find((client) => client.sessionId === occupantSessionId)?.send("room-presence", {
        direction: transition.direction,
        displayName: this.state.players.get(transition.sessionId)?.displayName ?? "Someone",
        zoneId: transition.zone.id,
      });
    }
  }

  private sendMediaZone(client: Client, sessionId: string) {
    const zone = this.mediaZoneBySessionId.get(sessionId);
    client.send("media-zone", zone ? { zoneId: zone.id, kind: zone.kind, name: zone.name, locked: this.lockedZoneIds.has(zone.id) } : { zoneId: null, kind: "public", name: "Public", locked: false });
  }

  private updateProximity() {
    const online = [...this.state.players.entries()].filter(([sessionId, player]) => player.presence === "online" && !this.meetingMembersBySessionId.has(sessionId) && !this.privateZoneIdBySessionId.has(sessionId));
    const next = new Map<string, Set<string>>(online.map(([sessionId]) => [sessionId, new Set<string>()]));
    for (let index = 0; index < online.length; index += 1) {
      const [firstId, first] = online[index]!;
      for (let otherIndex = index + 1; otherIndex < online.length; otherIndex += 1) {
        const [secondId, second] = online[otherIndex]!;
        const wasNearby = this.proximityBySessionId.get(firstId)?.has(secondId) ?? false;
        const radius = wasNearby ? this.world.proximityRadius + 0.5 : this.world.proximityRadius;
        if (Math.hypot(first.x - second.x, first.z - second.z) <= radius) {
          next.get(firstId)!.add(secondId);
          next.get(secondId)!.add(firstId);
        }
      }
    }
    for (const [sessionId, nearby] of next) {
      const previous = this.proximityBySessionId.get(sessionId) ?? new Set<string>();
      if (!sameSet(previous, nearby)) {
        this.clients.find((client) => client.sessionId === sessionId)?.send("proximity", { sessionIds: [...nearby] });
      }
    }
    this.proximityBySessionId = next;

    const nextGroupBySessionId = new Map<string, string>();
    const nextMembersByGroupId = new Map<string, Set<string>>();
    const visited = new Set<string>();
    for (const [sessionId, nearby] of next) {
      if (visited.has(sessionId) || nearby.size === 0) continue;
      const component = new Set<string>();
      const pending = [sessionId];
      while (pending.length > 0) {
        const current = pending.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.add(current);
        for (const adjacent of next.get(current) ?? []) if (!visited.has(adjacent)) pending.push(adjacent);
      }
      if (component.size < 2) continue;
      const groupId = createHash("sha256").update([...component].sort().join("\0")).digest("hex").slice(0, 24);
      nextMembersByGroupId.set(groupId, component);
      for (const member of component) nextGroupBySessionId.set(member, groupId);
    }

    const changedOldGroups = new Set<string>();
    for (const [sessionId, oldGroupId] of this.proximityGroupBySessionId) {
      if (nextGroupBySessionId.get(sessionId) !== oldGroupId) changedOldGroups.add(oldGroupId);
    }
    for (const oldGroupId of changedOldGroups) {
      const identities = [...(this.proximityGroupMembersById.get(oldGroupId) ?? [])]
        .map((sessionId) => this.mediaIdentityBySessionId.get(sessionId))
        .filter((identity): identity is string => Boolean(identity));
      void revokeProximityParticipants(this.officeId, oldGroupId, identities).catch(() => console.warn("Could not revoke proximity audio participants."));
    }
    const allSessions = new Set([...this.proximityGroupBySessionId.keys(), ...nextGroupBySessionId.keys()]);
    for (const sessionId of allSessions) {
      const previousGroupId = this.proximityGroupBySessionId.get(sessionId) ?? null;
      const groupId = nextGroupBySessionId.get(sessionId) ?? null;
      if (Boolean(previousGroupId) !== Boolean(groupId)) {
        const username = this.usernamesBySessionId.get(sessionId);
        if (username) void recordOfficeActivity(this.officeId, username, groupId ? "bubble.enter" : "bubble.leave");
      }
      if (groupId === (this.proximityGroupBySessionId.get(sessionId) ?? null)) continue;
      this.clients.find((client) => client.sessionId === sessionId)?.send("proximity-group", { groupId });
    }
    this.proximityGroupBySessionId = nextGroupBySessionId;
    this.proximityGroupMembersById = nextMembersByGroupId;
  }

  private followApproachPoint(followerSessionId: string, follower: InstanceType<typeof PlayerState>, target: InstanceType<typeof PlayerState>): Position {
    let dx = follower.x - target.x;
    let dz = follower.z - target.z;
    let distance = Math.hypot(dx, dz);
    if (distance < 0.01) {
      let seed = 0;
      for (const character of followerSessionId) seed = (seed * 31 + character.charCodeAt(0)) | 0;
      const angle = (Math.abs(seed) % 6283) / 1000;
      dx = Math.cos(angle);
      dz = Math.sin(angle);
      distance = 1;
    }
    const followDistance = Math.max(1.35, (follower.vehicleId ? 0.85 : 0.45) + this.world.playerRadius);
    return { x: target.x + dx / distance * followDistance, z: target.z + dz / distance * followDistance };
  }

  private startFollowing(followerSessionId: string, targetSessionId: string) {
    const follower = this.state.players.get(followerSessionId);
    const target = this.state.players.get(targetSessionId);
    const followerClient = this.clients.find((client) => client.sessionId === followerSessionId);
    if (!follower || !target || target.presence !== "online" || followerSessionId === targetSessionId || follower.vehicleMode === "manual") {
      followerClient?.send("follow-status", { status: "unavailable", targetSessionId });
      return;
    }
    this.stopFollowing(followerSessionId, "stopped", false);
    this.autoRoutes.delete(followerSessionId);
    const destination = this.followApproachPoint(followerSessionId, follower, target);
    const routeWorld = follower.vehicleId ? { ...this.world, playerRadius: Math.max(this.world.playerRadius, 0.66) } : this.world;
    const points = Math.hypot(destination.x - follower.x, destination.z - follower.z) <= 1.45
      ? null
      : findAutoRoute({ x: follower.x, z: follower.z }, destination, routeWorld);
    if (points === null && Math.hypot(destination.x - follower.x, destination.z - follower.z) > 1.45) {
      followerClient?.send("follow-status", { status: "unreachable", targetSessionId });
      return;
    }
    const now = performance.now();
    this.activeFollowsBySessionId.set(followerSessionId, {
      targetSessionId,
      nextRepathAt: now + 350,
      lastTargetX: target.x,
      lastTargetZ: target.z,
    });
    if (points?.length) this.autoRoutes.set(followerSessionId, { points, index: 0, stalledTicks: 0, followTargetSessionId: targetSessionId });
    this.movementInputs.set(followerSessionId, { x: 0, z: 0, sprint: false, receivedAt: now });
    const followerName = follower.displayName || this.usernamesBySessionId.get(followerSessionId) || "Someone";
    followerClient?.send("follow-status", { status: "started", targetSessionId, targetName: target.displayName });
    this.clients.find((client) => client.sessionId === targetSessionId)?.send("follow-alert", { followerSessionId, followerName });
  }

  private stopFollowing(followerSessionId: string, reason: "stopped" | "cancelled" | "target-left" | "blocked" = "stopped", notifyFollower = true) {
    const follow = this.activeFollowsBySessionId.get(followerSessionId);
    if (!follow) return;
    this.activeFollowsBySessionId.delete(followerSessionId);
    const route = this.autoRoutes.get(followerSessionId);
    if (route?.followTargetSessionId === follow.targetSessionId) this.autoRoutes.delete(followerSessionId);
    const follower = this.state.players.get(followerSessionId);
    if (follower?.vehicleMode === "auto") this.exitVehicle(followerSessionId, follower);
    const followerClient = this.clients.find((client) => client.sessionId === followerSessionId);
    if (notifyFollower) followerClient?.send("follow-status", { status: reason, targetSessionId: follow.targetSessionId });
    this.clients.find((client) => client.sessionId === follow.targetSessionId)?.send("follow-ended", { followerSessionId, reason });
  }

  private step(deltaSeconds: number) {
    const now = performance.now();
    for (const [followerSessionId, follow] of this.activeFollowsBySessionId) {
      const follower = this.state.players.get(followerSessionId);
      const target = this.state.players.get(follow.targetSessionId);
      if (!follower || !target || target.presence !== "online" || follower.vehicleMode === "manual") {
        this.stopFollowing(followerSessionId, "target-left");
        continue;
      }
      const targetMoved = Math.hypot(target.x - follow.lastTargetX, target.z - follow.lastTargetZ) >= 0.65;
      if (now < follow.nextRepathAt || !targetMoved) continue;
      follow.nextRepathAt = now + 350;
      follow.lastTargetX = target.x;
      follow.lastTargetZ = target.z;
      const destination = this.followApproachPoint(followerSessionId, follower, target);
      const distanceToFollowPoint = Math.hypot(destination.x - follower.x, destination.z - follower.z);
      if (distanceToFollowPoint <= 1.45) {
        this.autoRoutes.delete(followerSessionId);
        continue;
      }
      const routeWorld = follower.vehicleId ? { ...this.world, playerRadius: Math.max(this.world.playerRadius, 0.66) } : this.world;
      const points = findAutoRoute({ x: follower.x, z: follower.z }, destination, routeWorld);
      if (!points) {
        this.stopFollowing(followerSessionId, "blocked");
        continue;
      }
      this.autoRoutes.set(followerSessionId, { points, index: 0, stalledTicks: 0, followTargetSessionId: follow.targetSessionId });
    }
    let vehicleCollisionChanged = false;
    for (const [sessionId, player] of this.state.players) {
      const input = this.movementInputs.get(sessionId);
      if (!input) continue;

      // Stop a player if the connection has gone quiet; a held key cannot move
      // an avatar forever after the browser stops sending input.
      let intent: InputState = now - input.receivedAt > 150 ? { x: 0, z: 0, sprint: false, receivedAt: now } : input;
      const route = this.autoRoutes.get(sessionId);
      const seatApproach = this.seatApproachWorldsBySessionId.get(sessionId);
      const seatVehicle = seatApproach && this.mapLayout.props.find((prop) => prop.id === seatApproach.propId);
      const stillInsideVehicle = seatVehicle && (() => {
        const cos = Math.abs(Math.cos(seatVehicle.rotation));
        const sin = Math.abs(Math.sin(seatVehicle.rotation));
        const halfWidth = (seatVehicle.width * cos + seatVehicle.depth * sin) / 2 + this.world.playerRadius;
        const halfDepth = (seatVehicle.depth * cos + seatVehicle.width * sin) / 2 + this.world.playerRadius;
        return Math.abs(player.x - seatVehicle.x) <= halfWidth && Math.abs(player.z - seatVehicle.z) <= halfDepth;
      })();
      if (seatApproach && !route?.sitOnArrivalPropId && !stillInsideVehicle) this.seatApproachWorldsBySessionId.delete(sessionId);
      let movementWorld = player.vehicleId
        ? { ...(this.vehicleWorldsBySessionId.get(sessionId) ?? this.world), playerRadius: Math.max(this.world.playerRadius, 0.48), movementSpeed: this.world.movementSpeed * (intent.sprint ? 10 : 5) }
        : route?.sitOnArrivalPropId && seatApproach
          ? { ...seatApproach.world, movementSpeed: this.world.movementSpeed * NORMAL_WALK_SPEED_MULTIPLIER * (intent.sprint ? 2 : 1) }
          : seatApproach && stillInsideVehicle
            ? { ...seatApproach.world, movementSpeed: this.world.movementSpeed * NORMAL_WALK_SPEED_MULTIPLIER * (intent.sprint ? 2 : 1) }
        : route?.fastWalkFallback
          ? { ...this.world, movementSpeed: this.world.movementSpeed * AUTO_MOVE_WALK_FALLBACK_MULTIPLIER }
          : { ...this.world, movementSpeed: this.world.movementSpeed * NORMAL_WALK_SPEED_MULTIPLIER * (intent.sprint ? 2 : 1) };
      if (this.ghostModeBySessionId.get(sessionId)) movementWorld = ghostCollisionWorld(movementWorld);
      let movementSeconds = deltaSeconds;
      if (route && intent.x === 0 && intent.z === 0) {
        const target = route.points[route.index];
        if (!target) {
          this.autoRoutes.delete(sessionId);
          if (!route.followTargetSessionId) {
            if (player.vehicleMode === "auto") this.exitVehicle(sessionId, player);
            if (route.sitOnArrivalPropId) {
              if (this.seatPlayerOnProp(player, route.sitOnArrivalPropId)) this.seatApproachWorldsBySessionId.delete(sessionId);
              else if (route.sitOnArrivalZoneId && this.routeToAvailableSeat(sessionId, player, route.sitOnArrivalZoneId)) continue;
              else this.seatApproachWorldsBySessionId.delete(sessionId);
            } else if (route.sitOnArrivalZoneId && this.routeToAvailableSeat(sessionId, player, route.sitOnArrivalZoneId)) continue;
            this.clients.find((client) => client.sessionId === sessionId)?.send("auto-move-status", { status: "arrived" });
          }
        } else {
          const dx = target.x - player.x;
          const dz = target.z - player.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.035) {
            route.index += 1;
            if (route.index >= route.points.length) {
              this.autoRoutes.delete(sessionId);
              if (!route.followTargetSessionId) {
                if (player.vehicleMode === "auto") this.exitVehicle(sessionId, player);
                if (route.sitOnArrivalPropId) {
                  if (this.seatPlayerOnProp(player, route.sitOnArrivalPropId)) this.seatApproachWorldsBySessionId.delete(sessionId);
                  else if (route.sitOnArrivalZoneId && this.routeToAvailableSeat(sessionId, player, route.sitOnArrivalZoneId)) continue;
                  else this.seatApproachWorldsBySessionId.delete(sessionId);
                } else if (route.sitOnArrivalZoneId && this.routeToAvailableSeat(sessionId, player, route.sitOnArrivalZoneId)) continue;
                this.clients.find((client) => client.sessionId === sessionId)?.send("auto-move-status", { status: "arrived" });
              }
            }
          } else {
            intent = { x: dx / distance, z: dz / distance, sprint: input.sprint, receivedAt: input.receivedAt };
            movementSeconds = Math.min(deltaSeconds, distance / movementWorld.movementSpeed);
          }
        }
      }
      if (intent.x !== 0 || intent.z !== 0) {
        // The rendered avatar is anchored to its chair while seated, but its
        // authoritative coordinates remain at the walkable approach point.
        // Clear the seat before applying this movement tick so the avatar
        // immediately returns to that point and begins moving from it.
        player.sittingPropId = "";
        this.pendingSitsBySessionId.delete(sessionId);
      }
      let next = movePlayer({ x: player.x, z: player.z }, intent, movementSeconds, movementWorld);
      const previousZoneId = this.mediaZoneBySessionId.get(sessionId)?.id ?? null;
      const destinationZone = roomLayoutZoneAt(next, this.mapConfig);
      if (destinationZone && destinationZone.id !== previousZoneId && this.lockedZoneIds.has(destinationZone.id)) {
        next = { x: player.x, z: player.z };
      }
      if (route && (intent.x !== 0 || intent.z !== 0)) {
        const actualStep = Math.hypot(next.x - player.x, next.z - player.z);
        route.stalledTicks = actualStep < 0.0001 ? route.stalledTicks + 1 : 0;
        if (route.stalledTicks >= 12) {
          if (!route.followTargetSessionId && player.vehicleMode === "auto" && route.destination) {
            this.exitVehicle(sessionId, player);
            const fallbackPoints = findAutoRoute({ x: player.x, z: player.z }, route.destination, this.world);
            if (fallbackPoints) {
              this.autoRoutes.set(sessionId, {
                ...route,
                points: fallbackPoints,
                index: 0,
                stalledTicks: 0,
                fastWalkFallback: true,
              });
              this.clients.find((client) => client.sessionId === sessionId)?.send("auto-move-status", { status: "started", randomVehicle: false, fastWalkFallback: true });
              continue;
            }
          }
          if (!route.followTargetSessionId && route.destination) {
            const destinationZone = this.mapLayout.zones
              .filter((zone) => Math.abs(route.destination!.x - zone.x) <= zone.width / 2 && Math.abs(route.destination!.z - zone.z) <= zone.depth / 2)
              .sort((first, second) => first.width * first.depth - second.width * second.depth)[0];
            const sourceZone = roomLayoutZoneAt({ x: player.x, z: player.z }, this.mapConfig);
            const lockedDestination = Boolean(destinationZone && this.lockedZoneIds.has(destinationZone.id) && sourceZone?.id !== destinationZone.id);
            const landing = !lockedDestination ? autoMoveLandingPoint(route.destination, this.world, destinationZone) : null;
            if (landing) {
              if (player.vehicleId) this.exitVehicle(sessionId, player);
              player.x = landing.x;
              player.z = landing.z;
              player.sittingPropId = "";
              player.dancing = false;
              this.autoRoutes.delete(sessionId);
              this.pendingSitsBySessionId.delete(sessionId);
              this.seatApproachWorldsBySessionId.delete(sessionId);
              this.movementInputs.set(sessionId, { x: 0, z: 0, sprint: false, receivedAt: now });
              this.clients.find((client) => client.sessionId === sessionId)?.send("auto-move-status", { status: "arrived", teleported: true });
              continue;
            }
          }
          this.autoRoutes.delete(sessionId);
          if (route.followTargetSessionId) this.stopFollowing(sessionId, "blocked");
          else {
            if (player.vehicleMode === "auto") this.exitVehicle(sessionId, player);
            this.clients.find((client) => client.sessionId === sessionId)?.send("auto-move-status", { status: "blocked" });
          }
        }
      }
      player.x = next.x;
      player.z = next.z;
      const canAutoSit = !player.vehicleId
        && !route
        && !this.activeFollowsBySessionId.has(sessionId)
        && intent.x === 0
        && intent.z === 0
        && !player.sittingPropId;
      if (!canAutoSit) {
        this.pendingSitsBySessionId.delete(sessionId);
      } else {
        // A seat can be occupied by only one player. Keep the walkable state
        // position outside the chair collision; the client renders the seated
        // avatar at the seat anchor while this remains the movement/collision
        // position used to stand back up safely.
        const occupiedSeatIds = new Set(
          [...this.state.players.entries()]
            .filter(([otherSessionId, other]) => otherSessionId !== sessionId && other.presence === "online" && Boolean(other.sittingPropId))
            .map(([, other]) => {
              const seat = parseRoomPropSeatReference(other.sittingPropId);
              return roomPropSeatReference(seat.propId, seat.seatIndex);
            }),
        );
        // Measure the 3 m radius from the seat's nearest edge rather than its
        // center, so larger chairs/benches have a useful and consistent range.
        const nearbySeat = this.mapLayout.props.flatMap((prop) => roomPropSeatAnchors(prop)
          .map((anchor) => {
            const seatId = roomPropSeatReference(prop.id, anchor.index);
            if (occupiedSeatIds.has(seatId)) return [];
            const dx = player.x - prop.x;
            const dz = player.z - prop.z;
            const cos = Math.cos(prop.rotation);
            const sin = Math.sin(prop.rotation);
            const localX = dx * cos + dz * sin;
            const localZ = -dx * sin + dz * cos;
            const along = prop.width >= prop.depth ? localX : localZ;
            const across = prop.width >= prop.depth ? localZ : localX;
            const anchorAlong = prop.width >= prop.depth ? anchor.localX : anchor.localZ;
            const distanceFromEdge = Math.hypot(Math.max(0, Math.abs(along - anchorAlong) - 0.45), Math.max(0, Math.abs(across) - Math.min(prop.width, prop.depth) / 2));
            return [{ prop, seatId, distanceFromEdge, seatIndex: anchor.index }];
          }).flat())
          .filter((entry) => entry.distanceFromEdge <= autoSitSeatRadius)
          .sort((a, b) => a.distanceFromEdge - b.distanceFromEdge)[0];
        const pendingSit = this.pendingSitsBySessionId.get(sessionId);
        if (!nearbySeat) {
          this.pendingSitsBySessionId.delete(sessionId);
        } else if (!pendingSit || pendingSit.propId !== nearbySeat.seatId || Math.hypot(player.x - pendingSit.x, player.z - pendingSit.z) > 0.08) {
          this.pendingSitsBySessionId.set(sessionId, { propId: nearbySeat.seatId, startedAt: now, x: player.x, z: player.z });
        } else if (now - pendingSit.startedAt >= autoSitDelayMs) {
          // Keep the authoritative player position where it is: snapping it
          // onto the chair would put it inside the chair's movement blocker,
          // making the first movement input appear stuck. The renderer uses
          // sittingPropId to place the avatar visually on the chair.
          player.rotation = Math.atan2(nearbySeat.prop.x - player.x, nearbySeat.prop.z - player.z);
          player.sittingPropId = nearbySeat.seatId;
          this.pendingSitsBySessionId.delete(sessionId);
        }
      }
      // Keep the player seated when a collision blocks a direction. They can
      // steer away with another WASD direction; ejecting on a single blocked
      // simulation tick made manual driving feel like the keys were ignored.
      player.rotation = resolvePlayerFacing({ input: intent, seated: Boolean(player.sittingPropId), inVehicle: Boolean(player.vehicleId), currentRotation: player.rotation });
      if (player.vehicleId && player.vehiclePropId) {
        if (Math.hypot(player.vehiclePropX - player.x, player.vehiclePropZ - player.z) > 0.001
          || Math.abs(player.vehiclePropRotation - player.rotation) > 0.001) vehicleCollisionChanged = true;
        player.vehiclePropX = player.x;
        player.vehiclePropZ = player.z;
        player.vehiclePropRotation = player.rotation;
      }
    }
    if (vehicleCollisionChanged) this.refreshVehicleCollisionWorlds();
    this.updateMeetingMembership();
    this.updateProximity();
  }

  private exitVehicle(sessionId: string, player: InstanceType<typeof PlayerState>) {
    if (!player.vehicleId) return;
    const exitedVehicleId = player.vehicleId;
    player.sittingPropId = "";
    const username = this.usernamesBySessionId.get(sessionId);
    let parkedPropMoved = false;
    if (player.vehiclePropId) {
      parkedPropMoved = true;
      player.vehiclePropX = player.x;
      player.vehiclePropZ = player.z;
      player.vehiclePropRotation = player.rotation;
      const prop = this.mapLayout.props.find((item) => item.id === player.vehiclePropId);
      if (prop) {
        const footprint = roomPropCollisionFootprint({ ...prop, rotation: player.vehiclePropRotation });
        const exitWorld = this.vehicleWorldsBySessionId.get(sessionId) ?? this.world;
        const clearance = exitWorld.playerRadius + 0.12;
        const offsets = [0, 0.45, 0.9, 1.35];
        const candidates = offsets.flatMap((extra) => [
          { x: player.x + footprint.width / 2 + clearance + extra, z: player.z },
          { x: player.x - footprint.width / 2 - clearance - extra, z: player.z },
          { x: player.x, z: player.z + footprint.depth / 2 + clearance + extra },
          { x: player.x, z: player.z - footprint.depth / 2 - clearance - extra },
        ]);
        const exit = candidates.find((candidate) => isPositionWalkable(candidate, exitWorld));
        if (exit) {
          player.x = exit.x;
          player.z = exit.z;
        } else {
          const safeSpawn = findSafeSpawn(
            [...this.state.players.entries()].filter(([otherSessionId]) => otherSessionId !== sessionId).map(([, other]) => ({ x: other.x, z: other.z })),
            exitWorld,
          );
          player.x = safeSpawn.x;
          player.z = safeSpawn.z;
        }
      }
    }
    player.vehicleId = "";
    player.vehicleMode = "";
    this.vehicleWorldsBySessionId.delete(sessionId);
    if (parkedPropMoved) this.refreshVehicleCollisionWorlds();
    if (username) void recordOfficeActivity(this.officeId, username, "vehicle.leave", exitedVehicleId);
    this.clients.find((client) => client.sessionId === sessionId)?.send("vehicle-exited", {});
  }

  private seatPlayerOnProp(player: InstanceType<typeof PlayerState>, seatReference: string) {
    const seat = parseRoomPropSeatReference(seatReference);
    const prop = this.mapLayout.props.find((item) => item.id === seat.propId);
    const definition = prop && ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset);
    const canonicalSeatId = roomPropSeatReference(seat.propId, seat.seatIndex);
    const seatExists = Boolean(prop && roomPropSeatAnchors(prop, definition).some((anchor) => anchor.index === seat.seatIndex));
    const occupied = [...this.state.players.values()].some((other) => {
      if (other === player || other.presence !== "online" || !other.sittingPropId) return false;
      const otherSeat = parseRoomPropSeatReference(other.sittingPropId);
      return roomPropSeatReference(otherSeat.propId, otherSeat.seatIndex) === canonicalSeatId;
    });
    if (!prop || definition?.interaction !== "sit" || !seatExists || occupied) return false;
    // Keep authoritative coordinates at the walkable approach point; only the
    // renderer anchors the avatar to the seat itself.
    player.rotation = Math.atan2(prop.x - player.x, prop.z - player.z);
    player.sittingPropId = canonicalSeatId;
    return true;
  }

  private routeToAvailableSeat(sessionId: string, player: InstanceType<typeof PlayerState>, zoneId: string) {
    const zone = this.mapLayout.zones.find((item) => item.id === zoneId);
    if (!zone) return false;
    const occupiedSeatIds = new Set([...this.state.players.values()]
      .filter((other) => other.presence === "online" && Boolean(other.sittingPropId))
      .map((other) => other.sittingPropId));
    const walkingWorld = this.seatApproachWorldsBySessionId.get(sessionId)?.world ?? this.world;
    const seatRoute = findSeatApproachRoute({ x: player.x, z: player.z }, zone, this.mapLayout.props, walkingWorld, occupiedSeatIds);
    if (!seatRoute) return false;
    this.autoRoutes.set(sessionId, {
      points: seatRoute.points,
      index: 0,
      stalledTicks: 0,
      sitOnArrivalPropId: seatRoute.propId,
      sitOnArrivalZoneId: zoneId,
    });
    this.movementInputs.set(sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
    return true;
  }
}

export const officeRoomDefinition = defineRoom(OfficeRoom).filterBy(["officeId"]);

export function kickOfficeMember(officeId: string, username: string) {
  OfficeRoom.kickMember(officeId, username);
}

export function kickAccountFromOffices(username: string) {
  return OfficeRoom.kickAccountFromAllOffices(username);
}

export function closeOfficeRooms(officeId: string) {
  OfficeRoom.closeOffice(officeId);
}

function sameSet(first: Set<string>, second: Set<string>) {
  return first.size === second.size && [...first].every((value) => second.has(value));
}

function findSafeSpawn(occupied: Array<{ x: number; z: number }>, world: WorldConfig) {
  const gridStep = world.width > 30 ? 2.2 : 0.94;
  const columns = Math.max(1, Math.floor((world.width - 2) / gridStep));
  const rows = Math.max(1, Math.floor((world.depth - 2) / gridStep));
  const candidates = [
    ...world.spawnPoints,
    ...Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => ({
        x: -world.width / 2 + 1 + column * gridStep,
        z: -world.depth / 2 + 1 + row * gridStep,
      })),
    ).flat(),
  ];
  return candidates.find((candidate) =>
    isPositionWalkable(candidate, world) &&
    occupied.every((player) => Math.hypot(player.x - candidate.x, player.z - candidate.z) >= 0.9),
  ) ?? world.spawnPoints[0]!;
}

function findSeatApproachRoute(start: Position, zone: RoomLayoutZone, props: RoomLayout["props"], world: WorldConfig, occupiedSeatIds: Set<string>, preferredPoint: Position = start) {
  const seats = props
    .map((prop) => ({ prop, definition: ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset) }))
    .filter((entry) => entry.definition?.interaction === "sit"
      && Math.abs(entry.prop.x - zone.x) <= zone.width / 2
      && Math.abs(entry.prop.z - zone.z) <= zone.depth / 2)
    .sort((a, b) => Math.hypot(a.prop.x - preferredPoint.x, a.prop.z - preferredPoint.z) - Math.hypot(b.prop.x - preferredPoint.x, b.prop.z - preferredPoint.z));

  for (const { prop, definition } of seats) {
    const localFootprint = roomPropCollisionFootprint({ ...prop, rotation: 0 });
    const seatClearance = roomPropCollisionClearanceRadius(prop, world.playerRadius);
    const halfWidth = localFootprint.width / 2 + seatClearance + 0.12;
    const halfDepth = localFootprint.depth / 2 + seatClearance + 0.12;
    const seatAnchors = roomPropSeatAnchors(prop, definition);
    for (const anchor of seatAnchors) {
      const seatId = roomPropSeatReference(prop.id, anchor.index);
      if (occupiedSeatIds.has(seatId) || occupiedSeatIds.has(prop.id) && anchor.index === 0) continue;
      const sideOffsets: Position[] = [
        { x: anchor.localX, z: -halfDepth }, { x: anchor.localX, z: halfDepth },
        { x: -halfWidth, z: anchor.localZ }, { x: halfWidth, z: anchor.localZ },
      ];
      const approaches = sideOffsets.map((offset) => ({
        x: prop.x + offset.x * Math.cos(prop.rotation) + offset.z * Math.sin(prop.rotation),
        z: prop.z - offset.x * Math.sin(prop.rotation) + offset.z * Math.cos(prop.rotation),
      })).sort((a, b) => Math.hypot(a.x - start.x, a.z - start.z) - Math.hypot(b.x - start.x, b.z - start.z));
      for (const approach of approaches) {
        const points = findAutoRoute(start, approach, world);
        if (points) return { points, propId: seatId, zoneId: zone.id };
      }
    }
  }
  return null;
}

type GridNode = { x: number; z: number; key: string; f: number };

function findAutoRoute(start: Position, requestedTarget: Position, world: WorldConfig): Position[] | null {
  const step = 0.5;
  const keyOf = (x: number, z: number) => `${x},${z}`;
  const positionOf = (x: number, z: number): Position => ({ x: x * step, z: z * step });
  // Bound the search by the office's actual grid size. A fixed 100k ceiling
  // could stop before reaching rooms that require a long detour around walls
  // on the 200 × 250 m campus.
  const maxIterations = Math.ceil(world.width / step) * Math.ceil(world.depth / step) + 1;
  const nearestWalkableCell = (position: Position) => {
    const centerX = Math.round(position.x / step);
    const centerZ = Math.round(position.z / step);
    for (let radius = 0; radius <= 16; radius += 1) {
      const candidates: Array<{ x: number; z: number; distance: number }> = [];
      for (let dx = -radius; dx <= radius; dx += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          const x = centerX + dx;
          const z = centerZ + dz;
          const candidate = positionOf(x, z);
          if (!isPositionWalkable(candidate, world)) continue;
          candidates.push({ x, z, distance: (candidate.x - position.x) ** 2 + (candidate.z - position.z) ** 2 });
        }
      }
      if (candidates.length) return candidates.sort((a, b) => a.distance - b.distance)[0]!;
    }
    return null;
  };

  const source = nearestWalkableCell(start);
  const target = nearestWalkableCell(requestedTarget);
  if (!source || !target) return null;
  const sourceKey = keyOf(source.x, source.z);
  const targetKey = keyOf(target.x, target.z);
  if (sourceKey === targetKey) return [];

  const heap: GridNode[] = [];
  const push = (node: GridNode) => {
    heap.push(node);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (heap[parent]!.f <= heap[index]!.f) break;
      [heap[parent], heap[index]] = [heap[index]!, heap[parent]!];
      index = parent;
    }
  };
  const pop = () => {
    const first = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1, right = left + 1;
        let smallest = index;
        if (left < heap.length && heap[left]!.f < heap[smallest]!.f) smallest = left;
        if (right < heap.length && heap[right]!.f < heap[smallest]!.f) smallest = right;
        if (smallest === index) break;
        [heap[index], heap[smallest]] = [heap[smallest]!, heap[index]!];
        index = smallest;
      }
    }
    return first;
  };
  const heuristic = (x: number, z: number) => {
    const dx = Math.abs(target.x - x), dz = Math.abs(target.z - z);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const bestCost = new Map<string, number>([[sourceKey, 0]]);
  const parentByKey = new Map<string, string>();
  const closed = new Set<string>();
  push({ x: source.x, z: source.z, key: sourceKey, f: heuristic(source.x, source.z) });
  const directions = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ] as const;
  let iterations = 0;
  while (heap.length && iterations < maxIterations) {
    iterations += 1;
    const current = pop();
    if (closed.has(current.key)) continue;
    if (current.key === targetKey) {
      const route: Position[] = [];
      let key = targetKey;
      while (key !== sourceKey) {
        const [x, z] = key.split(",").map(Number) as [number, number];
        route.push(positionOf(x, z));
        key = parentByKey.get(key)!;
      }
      route.reverse();
      return smoothAutoRoute(positionOf(source.x, source.z), route, world);
    }
    closed.add(current.key);
    const currentCost = bestCost.get(current.key)!;
    for (const [dx, dz] of directions) {
      const x = current.x + dx, z = current.z + dz;
      const key = keyOf(x, z);
      if (closed.has(key) || !isAutoRouteEdgeWalkable(positionOf(current.x, current.z), positionOf(x, z), world)) continue;
      const nextCost = currentCost + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1);
      if (nextCost >= (bestCost.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      bestCost.set(key, nextCost);
      parentByKey.set(key, current.key);
      push({ x, z, key, f: nextCost + heuristic(x, z) });
    }
  }
  return null;
}

function smoothAutoRoute(start: Position, route: Position[], world: WorldConfig): Position[] {
  if (route.length < 2) return route;
  const result: Position[] = [];
  let anchor = start;
  let firstCandidate = 0;
  while (firstCandidate < route.length) {
    let furthestVisible = firstCandidate;
    for (let candidate = firstCandidate; candidate < route.length; candidate += 1) {
      if (isAutoRouteEdgeWalkable(anchor, route[candidate]!, world)) furthestVisible = candidate;
    }
    result.push(route[furthestVisible]!);
    anchor = route[furthestVisible]!;
    firstCandidate = furthestVisible + 1;
  }
  return result;
}

function isAutoRouteEdgeWalkable(first: Position, second: Position, world: WorldConfig) {
  const distance = Math.hypot(second.x - first.x, second.z - first.z);
  const samples = Math.max(1, Math.ceil(distance / 0.12));
  for (let index = 1; index <= samples; index += 1) {
    const progress = index / samples;
    if (!isPositionWalkable({
      x: first.x + (second.x - first.x) * progress,
      z: first.z + (second.z - first.z) * progress,
    }, world)) return false;
  }
  return true;
}

