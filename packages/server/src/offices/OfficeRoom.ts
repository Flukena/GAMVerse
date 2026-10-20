import { REALTIME_TICK_RATE_HZ, realtimeRuntimeMetrics } from "../infra/realtimeRuntimeMetrics.js";
import { proximityNeighbors } from "./proximityNeighbors.js";
import { affectedDeskOwners, sendDeskAssignmentNotices } from "./deskAssignmentNotices.js";
import { RoomSeatIndex, propDefinitionByAsset } from "./roomSeatIndex.js";
import { VehicleCollisionIndex } from "./vehicleCollisionIndex.js";
import { deskAssignmentFences } from "./deskAssignmentFences.js";
import { readOfficeMapProjection } from "./officeMapProjection.js";
import { DESK_ASSIGNMENT_MAP_CHANGED_LABEL, DESK_ASSIGNMENT_MEDIA_UNAVAILABLE_LABEL, DeskAssignmentError } from "./deskAssignments.js";
import { type DeskAssignmentFence } from "@gammyverse/shared";
import { restrictedZoneWorld, findAccessibleSpawn, isAccessibleSpawn } from "./privateMovement.js";
import { vehicleExitPosition } from "./vehicleExitPosition.js";
import { PrivateConversations } from "./privateConversations.js";
import { privateAccessFrame } from "./privateAccessFrame.js";
import { registerPrivateConversationMessages, deliverPrivateAccessEvents } from "./privateConversationMessages.js";
import type { ZoneMediaDescriptor } from "../media/zoneMediaDescriptor.js";
import { ConversationActions } from "./conversationActions.js";
import { meetRoomRouteCandidates, meetingZoneIsEmpty, meetingZoneIsPublic, publicConversationApproachCandidates, publicNavigationDeniedZones, type MeetGeometry, type MeetRoutePlan, type MeetTravelParticipant } from "./meetRoutePlanner.js";
import { SpatialConversations, type SpatialConversationMember } from "./spatialConversations.js";
import { registerConversationMessages } from "./conversationMessages.js";
import { CONVERSATION_SNAPSHOT_EVENT, type ConversationSnapshot } from "@gammyverse/shared";
import { DeskMessages, registerDeskMessages } from "./deskMessages.js";
import { AvailabilityMessages, applyPlayerAvailability, registerAvailabilityMessages } from "./availabilityMessages.js";
import { disposedRoomSpotlightUsernames } from "./spotlightRoomDisposal.js";
import { trackReconnectionSeat } from "./reconnectionSeat.js";
import { readReconnectAccess, SessionSecurity } from "./sessionSecurity.js";
import { registerSocialMessages, unregisterSocialMessages, socialPeople } from "./socialMessages.js";
import { OFFICE_ACCESS_REVOKED_CLOSE_CODE, OFFICE_CLOSED_CLOSE_CODE, Spotlight, spotlightDepartureReason, type SpotlightDeparture } from "./spotlight.js";
import { defineRoom, Protocol, ProtocolModifier, Room, type AuthContext, type Client, type ISendOptions } from "@colyseus/core";
import { randomBytes } from "node:crypto";
import { RouteSearchBudget, RouteWorkLimiter } from "./routeWorkBudget.js";
import { RouteSearchPool } from "./routeSearchPool.js";
import { autoMoveDriveSpeed } from "./autoMoveTiming.js";
import { autoMoveTravelMode, findAutoRoute } from "./routeNavigation.js";
import type { RouteSearchRequest, RouteSearchResult } from "./routeSearchProtocol.js";
import { autoMoveLandingPoint } from "./autoTeleport.js";
import { isValidAutoMoveInput, isValidTargetPlayerInput, shouldClearHandRaise, INPUT_MIN_INTERVAL_MS, RECONNECTION_SEAT_TIMEOUT_SECONDS, CAMPUS_WORLD, campusWorldFromConfig, DEFAULT_CHARACTER_ID, isPositionWalkable, isValidJumpInput, isValidMediaActivity, isValidMovementInput, JUMP_DURATION_MS, resolvePlayerFacing, type MovementInput, KENNEY_BLASTER_IDS, KENNEY_CHARACTER_IDS, KENNEY_PET_IDS, KENNEY_VEHICLE_IDS, movePlayer, OfficeState, PlayerState, parseRoomPropSeatReference, readRoomLayout, zoneAtWithExitMargin, roomPropCollisionFootprint, roomPropSeatAnchors, roomPropSeatReference, WORLD, type KenneyBlasterId, type KenneyCharacterId, type RoomLayout, type RoomLayoutZone, type AvailabilityProfile, defaultAvailability, type WorldConfig } from "@gammyverse/shared";
import { getAccountNickname, getSession, markUserActive } from "../auth/service.js";
import { isCustomCharacterId, userOwnsCharacterModel } from "../auth/characterModels.js";
import { getOfficeRole, markOfficeActive } from "./repository.js";
import { liveKitIdentity, proximityRoomName, revokeProximityParticipants } from "../media/service.js";
import { recordOfficeActivity } from "./activity.js";
import { ghostCollisionWorld, movementBlockedByProps } from "./ghostCollision.js";
import { database } from "../infra/db.js";
import { logServerError, logServerEvent } from "../infra/logger.js";

// At most ceil(1000 / 30) = 34 input messages/s. Allow a three-second
// buffered movement burst (102) plus 26 control/handshake messages.
const OFFICE_MAX_MESSAGES_PER_SECOND_COUNT = 128;
const DESK_MAP_CHANGED_LABEL = "The office desk map changed. Choose your desk again.";
const INITIAL_MESSAGE_COUNT = 0;
const PROXIMITY_GROUP_ID_BYTES = 12;
const SPATIAL_PROJECTION_INTERVAL_MS = 100;
const SPAWN_ACCESS_UNAVAILABLE_LABEL = "No accessible spawn point is available.";
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
type AutoRoute = { points: Position[]; index: number; stalledTicks: number; driveSpeedMps?: number; followTargetSessionId?: string; sitOnArrivalPropId?: string; sitOnArrivalZoneId?: string; destination?: Position; deskZoneId?: string };

// Normal walking uses one and a half times the base world movement speed.
const NORMAL_WALK_SPEED_MULTIPLIER = 1.5;
const AUTO_MOVE_VEHICLE_COLLISION_RADIUS_M = 0.48;
type SeatApproachWorld = { world: WorldConfig; propId: string };
type ActiveFollow = { targetSessionId: string; nextRepathAt: number; lastTargetX: number; lastTargetZ: number; repathPending?: boolean; initialPending?: boolean };
type PendingSit = { propId: string; startedAt: number; x: number; z: number };
type PendingSeatSearch = { player: InstanceType<typeof PlayerState>; start: Position; intentRevision: number | undefined; geometryRevision: number; accessSignature: string; zoneId: string };
const activityRefreshIntervalMs = 60_000;
const autoSitDelayMs = 3_000;
const AUTO_SIT_SCAN_INTERVAL_MS = 250;
const autoSitSeatRadius = 3;
const SEAT_WORKER_RETRY_INTERVAL_MS = 250;
const MAX_SEAT_WORKER_RETRIES = 4;

function routeIsWalkable(start: Position, points: Position[], world: WorldConfig) {
  let previous = start;
  for (const point of points) {
    const distance = Math.hypot(point.x - previous.x, point.z - previous.z);
    const samples = Math.max(1, Math.ceil(distance / 0.2));
    for (let index = 1; index <= samples; index += 1) {
      const ratio = index / samples;
      if (!isPositionWalkable({ x: previous.x + (point.x - previous.x) * ratio, z: previous.z + (point.z - previous.z) * ratio }, world)) return false;
    }
    previous = point;
  }
  return true;
}

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
  private conversations?: SpatialConversations;
  private privacy?: PrivateConversations;
  private conversationActions?: ConversationActions;
  private navigationGeometryRevision = 0;
  private static routeSearchPool: RouteSearchPool | undefined;
  private routeIntentRevisionBySessionId = new Map<string, number>();
  private routeIntentSequence = 0;
  private lastRouteAccessSignatureBySessionId = new Map<string, string>();
  private pendingRouteSearchBySessionId = new Map<string, number>();
  private pendingSeatSearchBySessionId = new Map<string, PendingSeatSearch>();
  private seatSearchRetryAtBySessionId = new Map<string, number>();
  private seatSearchRetryCountBySessionId = new Map<string, number>();
  private routeSnapshotRevision = -1;
  private routeSearchSequence = 0;
  private dynamicCollisionRevision = 0;
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

  broadcastPatch() {
    const startedAtMs = performance.now();
    try { return super.broadcastPatch(); }
    finally { realtimeRuntimeMetrics.recordPatchCycle(performance.now() - startedAtMs); }
  }

  /** One lazily-created worker pool is shared by every OfficeRoom in this process. */
  private static sharedRouteSearchPool() {
    return this.routeSearchPool ??= new RouteSearchPool();
  }

  private spotlight?: Spotlight;
  private availability?: AvailabilityMessages;
  private disposeAvailability?: () => void;
  state = new OfficeState();
  private officeId = "";
  private roomKey = "lobby";
  private world: WorldConfig = CAMPUS_WORLD;
  private worldVersion = 1;
  private mapConfig: unknown = { version: 1, layout: { version: 1, props: [], zones: [], walls: [], doors: [] } };
  private mapLayout: RoomLayout = this.parseMapLayout(this.mapConfig);
  private seatIndex = new RoomSeatIndex(this.mapLayout.props);
  private vehicleCollisionIndex = new VehicleCollisionIndex();
  private steppingMovement = false;
  private vehicleCollisionRefreshPending = false;
  private movementInputs = new Map<string, InputState>();
  /** Ignore a driver's own parked vehicle while they walk out to a room seat. */
  private seatApproachWorldsBySessionId = new Map<string, SeatApproachWorld>();
  private autoRoutes = new Map<string, AutoRoute>();
  private routeWorkLimiter = new RouteWorkLimiter();
  private pendingAutoMovesBySessionId = new Map<string, { client: Client; payload: unknown; timer: ReturnType<typeof setTimeout> }>();
  private ghostModeBySessionId = new Map<string, boolean>();
  private ghostHintAtBySessionId = new Map<string, number>();
  private pendingSitsBySessionId = new Map<string, PendingSit>();
  private autoSitScanAtBySessionId = new Map<string, number>();
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
  private deskTravel?: DeskMessages;
  private mapConfigVersion = 1;
  private officeRolesBySessionId = new Map<string, string>();
  private mapEditorSessionId: string | null = null;
  private mapEditorUsername: string | null = null;

  async onCreate(options: { officeId: string }) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.officeId)) {
      throw new Error("A valid office is required.");
    }
    this.setMetadata({ officeId: options.officeId });
    this.officeId = options.officeId;
    this.conversations = new SpatialConversations(this.officeId);
    registerConversationMessages(this, this.conversations);
    this.privacy = new PrivateConversations(this.officeId,this.conversations.roomIncarnationId, {
      onChange: () => {
        this.invalidateChangedRouteAccess();
        if (!this.reconcilingPrivateAccess) { this.updateMeetingMembership(); this.updateProximity(); }
      },
    });
    registerPrivateConversationMessages(this,this.privacy);
    this.initializeConversationActions();
    this.roomKey = "lobby";
    if (database) {
      const savedMap = await readOfficeMapProjection(database, this.officeId);
      this.mapConfigVersion = savedMap.configVersion;
      this.mapConfig = savedMap.config;
    }
    this.mapLayout = this.parseMapLayout(this.mapConfig);
    this.seatIndex = new RoomSeatIndex(this.mapLayout.props);
    this.world = this.vehicleCollisionIndex.update(this.mapConfig, this.mapLayout, this.mapConfigVersion, new Map());
    this.worldVersion = 4;
    this.setMetadata({ officeId: this.officeId });
    const maxClients = Number(process.env.ROOM_MAX_CLIENTS ?? 150);
    if (!Number.isInteger(maxClients) || maxClients < 1) throw new Error("ROOM_MAX_CLIENTS must be a positive integer.");
    this.maxClients = maxClients;
    const rooms = OfficeRoom.roomsByOffice.get(options.officeId) ?? new Set<OfficeRoom>();
    rooms.add(this);
    OfficeRoom.roomsByOffice.set(options.officeId, rooms);
    const assignment = deskAssignmentFences.current(this.officeId);
    if (assignment) {
      this.privacy.reconcile(this.privateFrame());
      void this.privacy.prepareAssignment(assignment);
    }
    this.patchRate = 50;
    this.maxMessagesPerSecond = OFFICE_MAX_MESSAGES_PER_SECOND_COUNT;
    logServerEvent("realtime", "office.room.created", { roomId: this.roomId, officeId: this.officeId, maxClients });

    this.spotlight = registerSocialMessages(this, this.officeId, {
      username: id => this.usernamesBySessionId.get(id),
      player: id => this.state.players.get(id),
      people: () => socialPeople(this.state.players.entries(), this.mediaZoneBySessionId, this.proximityGroupBySessionId, this.privacy?.audienceSessions()),
      client: id => this.clients.find(client => client.sessionId === id),
    });
    this.availability = new AvailabilityMessages(this.officeId, this, {
      username: id => !this.sessionSecurity.isRevoked(id) && this.sessionSecurity.activeSession(this.usernamesBySessionId.get(id) ?? "") === id ? this.usernamesBySessionId.get(id) : undefined,
      player: id => this.state.players.get(id),
      sessions: () => this.state.players.keys(),
      maintainer: id => this.officeRolesBySessionId.get(id) === "maintainer",
    });
    this.disposeAvailability = registerAvailabilityMessages(this, this.availability);
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
      if (role !== "owner" && role !== "admin" && role !== "maintainer") {
        client.send("map-edit-lock-result", { granted: false, error: "Only the office owner, an admin, or a maintainer can edit the map." });
        return;
      }
      if (this.mapEditorSessionId && this.mapEditorSessionId !== client.sessionId) {
        client.send("map-edit-lock-result", { granted: false, editorUsername: this.mapEditorUsername });
        return;
      }
      this.conversationActions?.mapChanged();
      this.mapEditorSessionId = client.sessionId;
      this.mapEditorUsername = this.usernamesBySessionId.get(client.sessionId) ?? null;
      this.broadcast("map-edit-lock", { editorUsername: this.mapEditorUsername });
      client.send("map-edit-lock-result", { granted: true });
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
      if (!player || player.presence !== "online" || player.vehicleId || player.sittingPropId) return;
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
    this.onMessage("media-activity", (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !isValidMediaActivity(payload)) return;
      player.microphoneEnabled = payload.microphone;
      player.cameraEnabled = payload.camera;
      player.screenShareEnabled = payload.screenShare;
    });
    this.onMessage("blaster-shot", (client: Client, payload: unknown) => {
      const shooter = this.state.players.get(client.sessionId);
      if (!shooter || !shooter.weaponId || typeof payload !== "object" || payload === null) return;
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
      this.deskTravel?.invalidate(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (!player || payload !== "") return;
      this.navigationIntent(client.sessionId);
      this.exitVehicle(client.sessionId, player);
      this.autoRoutes.delete(client.sessionId);
      this.pendingSitsBySessionId.delete(client.sessionId);
    });
    this.onMessage("vehicle-interact", (client: Client, payload: unknown) => {
      this.deskTravel?.invalidate(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.navigationIntent(client.sessionId);
      if (player.vehicleId) {
        this.autoRoutes.delete(client.sessionId);
        this.exitVehicle(client.sessionId, player);
        return;
      }
      if (typeof payload !== "object" || payload === null || !("propId" in payload) || typeof payload.propId !== "string") return;
      const placed = this.mapLayout.props.find((item) => item.id === payload.propId);
      const vehicleId = placed && propDefinitionByAsset.get(placed.asset)?.vehicleId;
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
    this.deskTravel = new DeskMessages(this.officeId, {
      username: sessionId => this.usernamesBySessionId.get(sessionId),
      navigationIntent: sessionId => this.navigationIntent(sessionId),
      player: sessionId => this.state.players.get(sessionId),
      start: (sessionId, player, zone) => this.startDeskRoute(sessionId, player, zone),
    });
    registerDeskMessages(this, this.deskTravel);
    this.onMessage("auto-move", this.handleAutoMove.bind(this));
    this.onMessage("ghost-mode", (client: Client, payload: unknown) => {
      this.deskTravel?.invalidate(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (!player || typeof payload !== "object" || payload === null || !("enabled" in payload) || typeof payload.enabled !== "boolean") return;
      const enabled = payload.enabled;
      this.ghostModeBySessionId.set(client.sessionId, enabled);
      if (enabled && this.autoRoutes.delete(client.sessionId)) {
        this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
        if (player.vehicleMode === "auto") this.exitVehicle(client.sessionId, player);
        client.send("auto-move-status", { status: "cancelled" });
      }
      this.broadcastGhostMode(client.sessionId, enabled);
    });
    this.onMessage("follow-player", this.handleFollowPlayer.bind(this));
    this.onMessage("follow-stop", (client: Client) => { this.navigationIntent(client.sessionId); this.stopFollowing(client.sessionId, "stopped"); });
    this.onMessage("follow-cancel", (client: Client, payload: unknown) => {
      if (typeof payload !== "object" || payload === null || !("followerSessionId" in payload) || typeof payload.followerSessionId !== "string") return;
      if (this.activeFollowsBySessionId.get(payload.followerSessionId)?.targetSessionId === client.sessionId) {
        this.stopFollowing(payload.followerSessionId, "cancelled");
      }
    });
    this.onMessage("wave", (client: Client, payload: unknown) => {
      const initiatingPlayer = this.state.players.get(client.sessionId);
      if (!initiatingPlayer) return;
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
    this.onMessage("auto-move-to-player", this.handleAutoMoveToPlayer.bind(this));
    this.onMessage("auto-move-cancel", (client: Client) => {
      this.clearPendingAutoMove(client.sessionId);
      const pendingDesk = this.deskTravel?.invalidate(client.sessionId);
      const pendingRoute = this.pendingRouteSearchBySessionId.has(client.sessionId);
      this.pendingRouteSearchBySessionId.delete(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      this.navigationIntent(client.sessionId);
      this.stopFollowing(client.sessionId, "stopped", false);
      this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
      this.pendingSitsBySessionId.delete(client.sessionId);
      if (this.autoRoutes.delete(client.sessionId) || pendingDesk || pendingRoute) {
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
      this.movementInputs.set(client.sessionId, { x: payload.x, z: payload.z, sprint: payload.sprint === true, facingYaw: payload.facingYaw, receivedAt: now });
      if (payload.x !== 0 || payload.z !== 0) {
        const pendingRoute = this.pendingRouteSearchBySessionId.has(client.sessionId);
        this.pendingRouteSearchBySessionId.delete(client.sessionId);
        this.navigationIntent(client.sessionId);
        const pendingDesk = this.deskTravel?.invalidate(client.sessionId);
        const player = this.state.players.get(client.sessionId);
        if (player) {
          player.sittingPropId = "";
          player.dancing = false;
        }
        this.stopFollowing(client.sessionId, "stopped");
        if (this.autoRoutes.delete(client.sessionId) || pendingDesk || pendingRoute) {
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

    // Registration precedes this final read: a concurrent assignment either refreshes this room,
    // or commits before this read. An older result cannot replace a newer applied version.
    if (database) {
      const latest = await readOfficeMapProjection(database, this.officeId);
      this.applyMapConfig(latest.config, latest.configVersion);
    }
    this.setFixedTimestep((context) => this.step(context.dt), REALTIME_TICK_RATE_HZ);
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
    const availability = await this.availability?.load(session.username, session.role === "maintainer") ?? defaultAvailability();
    const activeSessionId = this.sessionSecurity.activeSession(session.username);
    const existingSessionIds = new Set([
      ...(activeSessionId ? [activeSessionId] : []),
      ...[...this.state.players.entries()].filter(([sessionId, player]) => sessionId !== client.sessionId && player.username === session.username).map(([sessionId]) => sessionId),
    ]);
    this.sessionSecurity.activate(session.username, client.sessionId, sessionToken);
    for (const existingSessionId of existingSessionIds) {
      if (existingSessionId !== client.sessionId) this.replaceSession(existingSessionId, client, session.username);
    }
    return { ...session, officeId: options.officeId, roomKey: "lobby", officeRole: role, mediaIdentity: identity, availability };
  }

  private startDeskRoute(sessionId: string, player: PlayerState, zone: RoomLayoutZone) {
    const current = this.mapLayout.zones.find(entry => entry.id === zone.id && entry.kind === "private");
    // Desk assignment zones are deliberately excluded from private media
    // access, so canEnterMediaZone() returns false for them even for their
    // owner. The authenticated assignment lookup above already proves this is
    // the caller's own desk; physical return-to-desk must still be allowed.
    const locks = this.privacy?.lockedIds() ?? this.lockedZoneIds;
    if (!current || current.ownerUsername !== player.username || current.x !== zone.x || current.z !== zone.z
      || locks.has(current.id) && !this.canEnterMediaZone(sessionId, current.id)) return false;
    if (player.vehicleId && !this.exitVehicle(sessionId, player)) this.detachVehicleForTeleport(sessionId, player);
    this.stopFollowing(sessionId, "stopped", false);
    player.sittingPropId = "";
    player.dancing = false;
    this.pendingSitsBySessionId.delete(sessionId);
    this.autoSitScanAtBySessionId.delete(sessionId);
    this.movementInputs.set(sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
    this.autoRoutes.delete(sessionId);
    // Returning to an assigned desk is an explicit teleport action. Do not
    // route through the office or let obstacles make the destination fail.
    player.x = zone.x;
    player.z = zone.z;
    this.updateMeetingMembership();
    this.updateProximity();
    return "arrived";
  }

  private detachVehicleForTeleport(sessionId: string, player: PlayerState) {
    if (!player.vehicleId) return;
    const vehicleId = player.vehicleId;
    const username = this.usernamesBySessionId.get(sessionId);
    if (player.vehiclePropId) {
      player.vehiclePropX = player.x;
      player.vehiclePropZ = player.z;
      player.vehiclePropRotation = player.rotation;
    }
    player.vehicleId = "";
    player.vehicleMode = "";
    if (player.vehiclePropId) this.refreshVehicleCollisionWorlds();
    if (username) void recordOfficeActivity(this.officeId, username, "vehicle.leave", vehicleId);
    this.clients.find(client => client.sessionId === sessionId)?.send("vehicle-exited", {});
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
    this.refreshVehicleCollisionWorlds();
    this.clearSessionState(existingSessionId);
    this.sessionSecurity.finish(username, existingSessionId);
  }

  private broadcastGhostMode(sessionId: string, enabled: boolean) {
    const payload = { sessionId, enabled };
    for (const client of this.clients) client.send("ghost-mode-status", payload);
  }

  onJoin(client: Client, options: unknown, auth: { username: string; nickname?: string | null; mediaIdentity: string; characterId: string | null; officeRole: string; availability?: AvailabilityProfile }) {
    const rawSend = client.raw.bind(client);
    client.raw = (data: Uint8Array | Buffer, options?: ISendOptions, callback?: (error?: Error) => void) => {
      const protocol = (data[0] ?? 0) & ~(ProtocolModifier.TIMED | ProtocolModifier.UNRELIABLE);
      const kind = protocol === Protocol.ROOM_STATE_PATCH ? "patch" : protocol === Protocol.ROOM_STATE ? "snapshot" : "other";
      realtimeRuntimeMetrics.recordOutboundFrame(data.byteLength, kind);
      rawSend(data, options, callback);
    };
    const occupied = [...this.state.players.entries()]
      .filter(([sessionId]) => sessionId !== client.sessionId)
      .map(([, player]) => ({ x: player.x, z: player.z }));
    const accessWorld = this.movementAccessWorld(client.sessionId, this.world);
    const requestedPosition = typeof options === "object" && options !== null && "lastPosition" in options
      ? (options as { lastPosition?: unknown }).lastPosition
      : null;
    const preferredPosition = typeof requestedPosition === "object" && requestedPosition !== null &&
      "x" in requestedPosition && "z" in requestedPosition &&
      typeof requestedPosition.x === "number" && typeof requestedPosition.z === "number"
      ? { x: requestedPosition.x, z: requestedPosition.z }
      : null;
    // Client storage may suggest a return point, but the room still owns
    // spawn authority and accepts it only if it is walkable, accessible,
    // inside the map, and clear of other players.
    const spawn = preferredPosition && isAccessibleSpawn(preferredPosition, occupied, accessWorld)
      ? preferredPosition
      : findAccessibleSpawn(occupied, accessWorld);
    if(!spawn){this.sessionSecurity.finish(auth.username,client.sessionId);client.leave(OFFICE_ACCESS_REVOKED_CLOSE_CODE,SPAWN_ACCESS_UNAVAILABLE_LABEL);return;}
    const player = new PlayerState();
    player.x = spawn.x;
    player.z = spawn.z;
    player.rotation = 0;
    player.worldVersion = this.worldVersion;
    player.username = auth.username;
    player.displayName = auth.nickname?.trim() || auth.username;
    player.isMaintainer = auth.officeRole === "maintainer";
    player.characterId = auth.characterId ?? DEFAULT_CHARACTER_ID;
    player.petId = "";
    player.vehicleId = "";
    player.vehicleMode = "";
    player.vehiclePropId = "";
    player.vehiclePropX = spawn.x;
    player.vehiclePropZ = spawn.z;
    player.vehiclePropRotation = 0;
    player.sittingPropId = "";
    player.dancing = false;
    player.weaponId = "";
    applyPlayerAvailability(player, auth.availability ?? defaultAvailability());
    player.presence = "online";
    player.microphoneEnabled = false;
    player.cameraEnabled = false;
    player.screenShareEnabled = false;
    this.state.players.set(client.sessionId, player);
    this.usernamesBySessionId.set(client.sessionId, auth.username);
    this.officeRolesBySessionId.set(client.sessionId, auth.officeRole);
    this.sessionSecurity.activate(auth.username, client.sessionId);
    this.mediaIdentityBySessionId.set(client.sessionId, auth.mediaIdentity);
    this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
    this.ghostModeBySessionId.set(client.sessionId, false);
    this.autoRoutes.delete(client.sessionId);
    this.pendingSitsBySessionId.delete(client.sessionId);
    this.autoSitScanAtBySessionId.delete(client.sessionId);
    client.send("office-map", { config: this.mapConfig, configVersion: this.mapConfigVersion });
    client.send("map-edit-lock", { editorUsername: this.mapEditorUsername });
    client.send("ghost-mode-status", { sessionId: client.sessionId, enabled: false });
    void recordOfficeActivity(this.officeId, auth.username, "office.join");
    this.updateMeetingMembership();
    this.updatePrivateMembership();
    this.updateProximity();
    logServerEvent("realtime", "office.client.joined", { roomId: this.roomId, officeId: this.officeId, sessionId: client.sessionId, username: auth.username, clientCount: this.clients.length });
  }

  private prepareSessionDeparture(sessionId: string, player: PlayerState | undefined) {
    this.conversationActions?.removeSession(sessionId);
    this.privacy?.removeSession(sessionId,true);
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
    this.invalidateRouteIntent(client.sessionId);
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
    const profile = await this.availability?.load(username, this.officeRolesBySessionId.get(client.sessionId) === "maintainer");
    if (this.sessionSecurity.isRevoked(client.sessionId) || this.sessionSecurity.activeSession(username) !== client.sessionId) {
      client.leave(OFFICE_ACCESS_REVOKED_CLOSE_CODE, OFFICE_ACCESS_REVOKED_REASON);
      return;
    }
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.isMaintainer = access.officeRole === "maintainer";
      this.officeRolesBySessionId.set(client.sessionId, access.officeRole!);
      if (profile) applyPlayerAvailability(player, profile);
      if (player.worldVersion !== this.worldVersion) {
        const spawn = findAccessibleSpawn(
          [...this.state.players.entries()]
            .filter(([sessionId]) => sessionId !== client.sessionId)
            .map(([, other]) => ({ x: other.x, z: other.z })),
          this.movementAccessWorld(client.sessionId,this.world),
        );
        if(!spawn){client.leave(OFFICE_ACCESS_REVOKED_CLOSE_CODE,SPAWN_ACCESS_UNAVAILABLE_LABEL);return;}
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
    this.autoSitScanAtBySessionId.delete(client.sessionId);
    this.lastPacketAt.delete(client.sessionId);
    this.ghostModeBySessionId.delete(client.sessionId);
    this.ghostHintAtBySessionId.delete(client.sessionId);
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
    this.refreshVehicleCollisionWorlds();
    this.lastPacketAt.delete(client.sessionId);
    this.activityRefreshAtBySessionId.delete(client.sessionId);
    this.ghostModeBySessionId.delete(client.sessionId);
    this.ghostHintAtBySessionId.delete(client.sessionId);
    this.lastBlasterShotAtBySessionId.delete(client.sessionId);
    this.lastWaveAtBySessionId.delete(client.sessionId);
    this.lastJumpAtBySessionId.delete(client.sessionId);
    if (username) void recordOfficeActivity(this.officeId, username, "office.leave");
    this.clearSessionState(client.sessionId);
    this.sessionSecurity.finish(username, client.sessionId);
    for (const nearby of this.proximityBySessionId.values()) nearby.delete(client.sessionId);
  }

  private clearSessionState(sessionId: string) {
    this.invalidateRouteIntent(sessionId);
    this.routeIntentRevisionBySessionId.delete(sessionId);
    this.lastRouteAccessSignatureBySessionId.delete(sessionId);
    this.pendingRouteSearchBySessionId.delete(sessionId);
    this.pendingSeatSearchBySessionId.delete(sessionId);
    this.seatSearchRetryAtBySessionId.delete(sessionId);
    this.seatSearchRetryCountBySessionId.delete(sessionId);
    this.clearPendingAutoMove(sessionId);
    this.routeWorkLimiter.forget(sessionId);
    this.conversationActions?.removeSession(sessionId);
    this.privacy?.removeSession(sessionId,false);
    this.deskTravel?.invalidate(sessionId);
    const collections = [
      this.usernamesBySessionId, this.officeRolesBySessionId, this.movementInputs,
      this.ghostModeBySessionId, this.ghostHintAtBySessionId, this.autoRoutes, this.pendingSitsBySessionId, this.autoSitScanAtBySessionId,
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
    OfficeRoom.routeSearchPool?.removeSnapshot(this.roomId);
    for (const sessionId of this.routeIntentRevisionBySessionId.keys()) this.invalidateRouteIntent(sessionId);
    this.routeIntentRevisionBySessionId.clear();
    for (const pending of this.pendingAutoMovesBySessionId.values()) clearTimeout(pending.timer);
    this.pendingAutoMovesBySessionId.clear();
    void this.privacy?.dispose();
    this.conversationActions?.dispose();
    this.deskTravel?.invalidateAll();
    this.disposeAvailability?.();
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
    if (OfficeRoom.roomsByOffice.size === 0 && OfficeRoom.routeSearchPool) {
      const pool = OfficeRoom.routeSearchPool;
      OfficeRoom.routeSearchPool = undefined;
      void pool.dispose();
    }
  }

  private releaseMapEditLock(sessionId: string) {
    if (this.mapEditorSessionId !== sessionId) return;
    this.conversationActions?.mapChanged();
    this.mapEditorSessionId = null;
    this.mapEditorUsername = null;
    this.broadcast("map-edit-lock", { editorUsername: null });
  }

  private revokeUsername(username: string, reason: string, revokedSpotlights: Set<Spotlight>) {
    let kickedClientCount = 0;
    for (const [sessionId, memberUsername] of this.usernamesBySessionId) {
      if (memberUsername !== username) continue;
      this.revokeSpotlightSession(sessionId, SECURITY_DEPARTURE_LABEL, revokedSpotlights);
      this.invalidateRouteIntent(sessionId);
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
      for (const client of room.clients) room.invalidateRouteIntent(client.sessionId);
      for (const client of [...room.clients]) client.leave(OFFICE_CLOSED_CLOSE_CODE, OFFICE_DELETED_REASON_LABEL);
    }
    for (const spotlight of spotlights) {
      void spotlight.close().catch((error) => logServerError("realtime", SPOTLIGHT_CLOSE_FAILED_EVENT_LABEL, error, { officeId }));
    }
  }

  static deskAssignmentAppliedVersion(officeId: string): number | null {
    const rooms = [...(OfficeRoom.roomsByOffice.get(officeId) ?? [])];
    return rooms.length ? Math.min(...rooms.map(room => room.mapConfigVersion)) : null;
  }

  static async prepareDeskAssignment(fence: DeskAssignmentFence) {
    const rooms = OfficeRoom.roomsByOffice.get(fence.officeId) ?? new Set<OfficeRoom>();
    if ([...rooms].some(room => room.mapConfigVersion > fence.expectedConfigVersion))
      throw new DeskAssignmentError("conflict", DESK_ASSIGNMENT_MAP_CHANGED_LABEL);
    const operation = deskAssignmentFences.prepare(fence);
    const preparations = [...rooms].map(room => {
      room.refreshPrivateAccess();
      const preparation = room.privacy?.prepareAssignment(operation) ?? Promise.resolve(true);
      room.refreshConversations();
      return preparation;
    });
    if (!(await Promise.all(preparations)).every(Boolean))
      throw new DeskAssignmentError("unavailable", DESK_ASSIGNMENT_MEDIA_UNAVAILABLE_LABEL);
  }

  static rollbackDeskAssignment(fence: DeskAssignmentFence) {
    if (!deskAssignmentFences.rollback(fence)) return;
    for (const room of OfficeRoom.roomsByOffice.get(fence.officeId) ?? []) {
      room.privacy?.releaseAssignment(fence.operationId);
      room.refreshConversations();
    }
  }

  static async updateMap(officeId: string) {
    const projection = await readOfficeMapProjection(database, officeId);
    for (const room of OfficeRoom.roomsByOffice.get(officeId) ?? []) room.applyMapConfig(projection.config, projection.configVersion);
    deskAssignmentFences.applied(officeId, projection.configVersion);
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
    this.privacy?.mapChanged(this.privateFrame());
    this.broadcast("desk-zone-updated", { zoneId: update.id, name: update.name, ownerUsername: update.ownerUsername });
  }

  private applyMapConfig(config: unknown, configVersion = this.mapConfigVersion) {
    if (configVersion < this.mapConfigVersion) return;
    this.invalidateRouteSearchRoom();
    this.mapConfigVersion = configVersion;
    this.navigationGeometryRevision += 1;
    this.conversationActions?.mapChanged();
    const pendingDesks = new Set(this.deskTravel?.invalidateAll());
    const nextLayout = this.parseMapLayout(config);
    realtimeRuntimeMetrics.increment("mapApplies");
    const affectedOwners = affectedDeskOwners(this.mapLayout, nextLayout);
    const worldGeometryChanged = worldGeometrySignature(this.mapLayout) !== worldGeometrySignature(nextLayout);
    this.mapConfig = config;
    this.mapLayout = nextLayout;
    this.seatIndex = new RoomSeatIndex(nextLayout.props);
    this.pendingSitsBySessionId.clear();
    this.autoSitScanAtBySessionId.clear();
    this.privacy?.mapChanged(this.privateFrame());
    const assignment = deskAssignmentFences.current(this.officeId);
    if (assignment && configVersion >= assignment.newConfigVersion) this.privacy?.releaseAssignment(assignment.operationId);
    for (const [sessionId, route] of this.autoRoutes) {
      if (!route.deskZoneId) continue;
      this.autoRoutes.delete(sessionId);
      pendingDesks.add(sessionId);
    }
    for (const sessionId of pendingDesks) this.clients.find(client => client.sessionId === sessionId)?.send("auto-move-status", { status: "cancelled", message: DESK_MAP_CHANGED_LABEL });
    this.refreshVehicleCollisionWorlds();
    let detachedVehicles = false;
    for (const [sessionId, player] of this.state.players) {
      if (!player.vehiclePropId) continue;
      const mappedVehicleId = this.vehicleCollisionIndex.vehicleIdForProp(player.vehiclePropId);
      if (mappedVehicleId && (!player.vehicleId || mappedVehicleId === player.vehicleId)) continue;
      if (player.vehicleId) this.clients.find(client => client.sessionId === sessionId)?.send("vehicle-exited", {});
      player.vehicleId = "";
      player.vehicleMode = "";
      player.vehiclePropId = "";
      player.vehiclePropX = player.x;
      player.vehiclePropZ = player.z;
      player.vehiclePropRotation = player.rotation;
      detachedVehicles = true;
    }
    if (detachedVehicles) this.refreshVehicleCollisionWorlds();
    if (worldGeometryChanged) this.worldVersion += 1;
    this.lockedZoneIds = new Set([...this.lockedZoneIds].filter((id) => this.mapLayout.zones.some((zone) => zone.id === id)));
    let relocatedPlayers = 0;
    for (const [sessionId, player] of this.state.players) {
      if (worldGeometryChanged) player.worldVersion = this.worldVersion;
      if (player.sittingPropId && !this.seatIndex.has(player.sittingPropId)) player.sittingPropId = "";
      if (worldGeometryChanged && !isPositionWalkable({ x: player.x, z: player.z }, this.world)) {
        const spawn = findAccessibleSpawn(
          [...this.state.players.entries()].filter(([otherId]) => otherId !== sessionId).map(([, other]) => ({ x: other.x, z: other.z })),
          this.movementAccessWorld(sessionId,this.world),
        );
        if(!spawn){player.presence="away";this.clients.find(client=>client.sessionId===sessionId)?.leave(OFFICE_ACCESS_REVOKED_CLOSE_CODE,SPAWN_ACCESS_UNAVAILABLE_LABEL);continue;}
        player.x = spawn.x;
        player.z = spawn.z;
        relocatedPlayers += 1;
      }
    }
    logServerEvent("realtime", "office.map.applied", { roomId: this.roomId, officeId: this.officeId, worldGeometryChanged, worldVersion: this.worldVersion, playerCount: this.state.players.size, relocatedPlayers });
    this.broadcast("office-map", { config, configVersion: this.mapConfigVersion });
    this.updatePrivateMembership();
    this.updateProximity();
    sendDeskAssignmentNotices(this.clients, this.usernamesBySessionId, affectedOwners, this.officeId, this.mapConfigVersion);
  }

  /** Keep collision footprints aligned with movable vehicle props in the scene. */
  private refreshVehicleCollisionWorlds() {
    if (this.steppingMovement) {
      this.vehicleCollisionRefreshPending = true;
      return;
    }
    const movedProps = new Map<string, { x: number; z: number; rotation: number }>();
    for (const player of this.state.players.values()) {
      if (!player.vehiclePropId) continue;
      movedProps.set(player.vehiclePropId, {
        x: player.vehiclePropX,
        z: player.vehiclePropZ,
        rotation: player.vehiclePropRotation,
      });
    }

    const previousWorld = this.world;
    this.world = this.vehicleCollisionIndex.update(this.mapConfig, this.mapLayout, this.mapConfigVersion, movedProps);
    if (previousWorld !== this.world) {
      this.dynamicCollisionRevision += 1;
    }
    this.vehicleCollisionRefreshPending = false;
  }

  private worldForVehicle(player: InstanceType<typeof PlayerState>, world = this.world): WorldConfig {
    return player.vehicleId && player.vehiclePropId
      ? { ...world, excludedVehiclePropId: player.vehiclePropId }
      : world;
  }

  private navigationGeometry(): MeetGeometry {
    return {world: this.world, layout: this.mapLayout, lockedZoneIds: this.lockedZoneIds, revision: this.navigationGeometryRevision};
  }

  private navigationIntent(sessionId: string) {
    this.invalidateRouteIntent(sessionId);
    this.conversationActions?.navigationIntent(sessionId);
  }

  private invalidateRouteIntent(sessionId: string) {
    this.routeIntentRevisionBySessionId.set(sessionId, ++this.routeIntentSequence);
    this.pendingSeatSearchBySessionId.delete(sessionId);
    this.seatSearchRetryAtBySessionId.delete(sessionId);
    this.seatSearchRetryCountBySessionId.delete(sessionId);
    OfficeRoom.routeSearchPool?.cancelSession(this.roomId, sessionId);
  }

  private invalidateRouteSearchRoom(staticGeometryChanged = true) {
    OfficeRoom.routeSearchPool?.cancelRoom(this.roomId);
    if (staticGeometryChanged) this.routeSnapshotRevision = -1;
    for (const sessionId of this.state.players.keys()) this.invalidateRouteIntent(sessionId);
  }

  private async searchRoute(start: Position, destination: Position, sessionId: string, world: WorldConfig, priority: "interactive" | "follow" = "interactive") {
    const result = await this.submitRouteSearch({ start, destination, sessionId, world, priority });
    return result?.points ?? null;
  }

  private async searchPublicConversationRoute(participant: MeetTravelParticipant, target: Position, geometry: MeetGeometry, targetMeetingZoneId?: string) {
    const geometryRevision = geometry.revision;
    if (!participant.active || participant.presence !== "online" || participant.vehicleId) return null;
    const deniedZones = publicNavigationDeniedZones(geometry);
    if (targetMeetingZoneId && !geometry.layout.zones.some(zone => zone.id === targetMeetingZoneId && meetingZoneIsPublic(zone, geometry))) return null;
    const world = restrictedZoneWorld(this.world, deniedZones);
    const result = await this.submitRouteSearch({
      start: { x: participant.x, z: participant.z },
      destination: target,
      sessionId: participant.sessionId,
      world,
      priority: "interactive",
      mode: "approach",
      approachDestinations: publicConversationApproachCandidates(target),
    });
    if (!result?.points || !result.destination) return null;
    const current = this.state.players.get(participant.sessionId);
    const currentWorld = restrictedZoneWorld(this.world, deniedZones);
    if (!current || !this.routeSessionIsActive(participant.sessionId, current) || current.presence !== "online" || current.vehicleId
        || Math.hypot(current.x - participant.x, current.z - participant.z) > 0.75
        || !routeIsWalkable({ x: participant.x, z: participant.z }, result.points, currentWorld)) return null;
    return { sessionId: participant.sessionId, points: result.points, destination: result.destination };
  }

  private async searchMeetingRoomRoutes(from: MeetTravelParticipant, to: MeetTravelParticipant, geometry: MeetGeometry, zone: RoomLayoutZone) {
    const geometryRevision = geometry.revision;
    const deniedZones = publicNavigationDeniedZones(geometry);
    const world = restrictedZoneWorld(this.world, deniedZones);
    const result = await this.submitRouteSearch({
      start: { x: from.x, z: from.z },
      destination: { x: zone.x, z: zone.z },
      sessionId: from.sessionId,
      world,
      priority: "interactive",
      mode: "meet-room",
      meetRoomCandidates: meetRoomRouteCandidates(from, to, zone),
    });
    const routes = result?.routes;
    if (!routes || routes.length !== 2) return null;
    const currentFrom = this.state.players.get(from.sessionId);
    const currentTo = this.state.players.get(to.sessionId);
    const currentWorld = restrictedZoneWorld(this.world, deniedZones);
    if (!currentFrom || !currentTo || Math.hypot(currentFrom.x - from.x, currentFrom.z - from.z) > 0.75
        || Math.hypot(currentTo.x - to.x, currentTo.z - to.z) > 0.75
        || !routeIsWalkable({ x: from.x, z: from.z }, routes[0]!.points, currentWorld)
        || !routeIsWalkable({ x: to.x, z: to.z }, routes[1]!.points, currentWorld)) return null;
    return {
      routes: [
        { sessionId: from.sessionId, points: routes[0]!.points, destination: routes[0]!.destination },
        { sessionId: to.sessionId, points: routes[1]!.points, destination: routes[1]!.destination },
      ],
      geometryRevision,
    };
  }

  private async submitRouteSearch(input: {
    start: Position; destination: Position; sessionId: string; world: WorldConfig;
    priority: RouteSearchRequest["priority"]; mode?: RouteSearchRequest["mode"]; seatSearch?: RouteSearchRequest["seatSearch"];
    approachDestinations?: RouteSearchRequest["approachDestinations"];
    meetRoomCandidates?: RouteSearchRequest["meetRoomCandidates"];
  }): Promise<RouteSearchResult | null> {
    const pool = OfficeRoom.sharedRouteSearchPool();
    const revision = this.navigationGeometryRevision;
    const snapshot = { roomId: this.roomId, revision, world: this.world, seatLayout: { props: this.mapLayout.props, zones: this.mapLayout.zones } };
    if (this.routeSnapshotRevision !== revision) {
      if (!pool.setSnapshot(snapshot)) return null;
      this.routeSnapshotRevision = revision;
    }
    const requestId = `${this.roomId}:${input.sessionId}:${++this.routeSearchSequence}`;
    const request = {
      roomId: this.roomId,
      sessionId: input.sessionId,
      requestId,
      revision,
      start: input.start,
      destination: input.destination,
      priority: input.priority,
      mode: input.mode,
      seatSearch: input.seatSearch,
      approachDestinations: input.approachDestinations,
      meetRoomCandidates: input.meetRoomCandidates,
      dynamicCollisionGrid: input.world.dynamicCollisionGrid,
      excludedVehiclePropId: input.world.excludedVehiclePropId,
      playerRadius: input.world.playerRadius,
      accessBlockers: input.world.accessOverlay,
    } as const;
    let submitted = pool.submit(request);
    // The bounded process cache may evict a quiet room while this OfficeRoom
    // remains alive. Refresh only on that explicit miss, not on every search.
    if (submitted.admission.status === "busy" && submitted.admission.reason === "stale-snapshot") {
      if (!pool.setSnapshot(snapshot)) return null;
      this.routeSnapshotRevision = revision;
      submitted = pool.submit(request);
    }
    if (submitted.admission.status !== "queued") return null;
    return await submitted.result;
  }

  private commitConversationRoutes(plan: MeetRoutePlan, zoneId?: string) {
    if (plan.geometryRevision !== this.navigationGeometryRevision || !plan.routes.every(route => this.conversationActions?.participant(route.sessionId)?.active)) throw new Error("The conversation route changed. Try again.");
    const currentGeometry = this.navigationGeometry();
    const deniedZones = publicNavigationDeniedZones(currentGeometry);
    const liveWorld = restrictedZoneWorld(this.world, deniedZones);
    if (!plan.routes.every(route => {
      const player = this.state.players.get(route.sessionId);
      return player && routeIsWalkable({ x: player.x, z: player.z }, route.points, liveWorld)
        && isPositionWalkable(route.destination, liveWorld);
    })) throw new Error("The conversation route is no longer clear.");
    if (zoneId) {
      if (!this.privacy) throw new Error("Meeting room access is unavailable.");
      const zone = this.mapLayout.zones.find(candidate => candidate.id === zoneId);
      if (!zone || zone.kind !== "meeting" || this.lockedZoneIds.has(zoneId)
          || !meetingZoneIsEmpty(zone, this.conversationActions?.participants() ?? [])) throw new Error("The meeting room is no longer available.");
      this.privacy.access.lockForMeeting(zoneId, plan.routes.map(route => route.sessionId), Date.now());
      this.lockedZoneIds = this.privacy.lockedIds();
      this.invalidateRouteSearchRoom();
      this.navigationGeometryRevision += 1;
      this.broadcast("zone-locks", { zoneIds: [...this.lockedZoneIds] });
    }
    for (const route of plan.routes) this.commitConversationRoute(route);
  }

  private commitConversationRoute(route: MeetRoutePlan["routes"][number]) {
    const player = this.state.players.get(route.sessionId)!;
    this.conversationActions?.invalidateApproach(route.sessionId);
    this.deskTravel?.invalidate(route.sessionId);
    this.stopFollowing(route.sessionId, "stopped", false);
    this.pendingSitsBySessionId.delete(route.sessionId);
    this.seatApproachWorldsBySessionId.delete(route.sessionId);
    player.sittingPropId = "";
    player.dancing = false;
    this.movementInputs.set(route.sessionId, {x: 0, z: 0, sprint: false, receivedAt: performance.now()});
    if (route.points.length) this.autoRoutes.set(route.sessionId, {points: route.points, index: 0, stalledTicks: 0});
    else this.autoRoutes.delete(route.sessionId);
    this.clients.find(client => client.sessionId === route.sessionId)?.send("auto-move-status", {status: route.points.length ? "started" : "arrived", destination: route.destination});
  }

  private initializeConversationActions() {
    if (!this.conversations) return;
    this.conversationActions = new ConversationActions(this.officeId,this,{players:this.state.players,security:this.sessionSecurity,conversations:this.conversations,
      editingSessionId:()=>this.mapEditorSessionId,geometry:()=>this.navigationGeometry(),commit:(plan,zoneId)=>this.commitConversationRoutes(plan,zoneId),
      searchPublicApproach:(participant,target,geometry,zoneId)=>this.searchPublicConversationRoute(participant,target,geometry,zoneId),
      searchMeetingRoom:(from,to,geometry,zone)=>this.searchMeetingRoomRoutes(from,to,geometry,zone),
      send:(id,event,payload)=>{this.clients.find(client=>client.sessionId===id)?.send(event,payload);},broadcast:(event,payload)=>this.broadcast(event,payload)});
  }

  private privateFrame() { return privateAccessFrame(this.mapLayout.zones,this.state.players,this.sessionSecurity,this.mediaZoneBySessionId); }

  private routeAccessSignature(sessionId: string) {
    const locks = this.privacy?.lockedIds() ?? this.lockedZoneIds;
    return this.mapLayout.zones
      .filter(zone => zone.kind !== "restroom" && locks.has(zone.id) && !this.canEnterMediaZone(sessionId, zone.id))
      .map(zone => zone.id)
      .sort()
      .join("|");
  }

  private invalidateChangedRouteAccess() {
    for (const sessionId of this.state.players.keys()) {
      const next = this.routeAccessSignature(sessionId);
      const previous = this.lastRouteAccessSignatureBySessionId.get(sessionId);
      if (previous !== undefined && previous !== next) this.invalidateRouteIntent(sessionId);
      this.lastRouteAccessSignatureBySessionId.set(sessionId, next);
    }
  }

  private routeSessionIsActive(sessionId: string, player: InstanceType<typeof PlayerState>) {
    return !player.username || (!this.sessionSecurity.isRevoked(sessionId) && this.sessionSecurity.activeSession(player.username) === sessionId);
  }

  private movementAccessWorld(sessionId:string,world:WorldConfig) {
    const locks=this.privacy?.lockedIds()??this.lockedZoneIds;
    return restrictedZoneWorld(world,this.mapLayout.zones.filter(zone=>zone.kind!=="restroom"&&locks.has(zone.id)&&!this.canEnterMediaZone(sessionId,zone.id)));
  }

  private canEnterMediaZone(sessionId:string,zoneId:string) {
    const locks=this.privacy?.lockedIds()??this.lockedZoneIds;
    return !locks.has(zoneId)||(this.privacy?.canEnter(sessionId,zoneId)??false);
  }

  private reconcilingPrivateAccess = false;
  private refreshPrivateAccess() {
    if(!this.privacy)return;
    this.reconcilingPrivateAccess = true;
    try { this.privacy.reconcile(this.privateFrame()); }
    finally { this.reconcilingPrivateAccess = false; }
    this.invalidateChangedRouteAccess();
    const locks=this.privacy.lockedIds();
    if(!sameSet(locks,this.lockedZoneIds)){this.invalidateRouteSearchRoom();this.lockedZoneIds=locks;this.navigationGeometryRevision+=1;this.conversationActions?.mapChanged();this.broadcast("zone-locks",{zoneIds:[...locks]});}
    deliverPrivateAccessEvents(this,this.privacy.drainEvents());
  }

  private refreshConversations() {
    if (!this.conversations) return;
    this.refreshPrivateAccess();
    const members: SpatialConversationMember[] = [];
    for (const [sessionId, player] of this.state.players) {
      if (player.presence !== "online" || this.sessionSecurity.isRevoked(sessionId) || this.sessionSecurity.activeSession(player.username) !== sessionId) continue;
      const mediaIdentity = this.mediaIdentityBySessionId.get(sessionId);
      const zone = this.mediaZoneBySessionId.get(sessionId);
      if(zone && this.privacy && !this.privacy.mayHear(sessionId,zone.id))continue;
      const descriptor=zone?this.privacy?.descriptor(zone.id):undefined;
      const targetId = zone?.id ?? this.proximityGroupBySessionId.get(sessionId);
      if (!targetId || !mediaIdentity) continue;
      members.push({ id: player.username, sessionId, username: player.username, displayName: player.displayName || player.username,
        characterId: player.characterId || DEFAULT_CHARACTER_ID, mediaIdentity, mediaTarget:descriptor?{id:zone!.id,generation:descriptor.generation,available:descriptor.available}:undefined,admissionLeaseId:zone?this.privacy?.admissionLeaseId(sessionId,zone.id):undefined, kind: zone?.kind === "meeting" ? "meeting" : zone ? "private" : "proximity", targetId });
    }
    const changed = this.conversations.reconcile(members);
    if (changed) for (const client of this.clients) client.send(CONVERSATION_SNAPSHOT_EVENT, this.conversations.snapshot(client.sessionId));
    this.conversationActions?.refresh(changed);
  }

  static async getConversationMediaGrant(officeId:string,username:string,identity:string):Promise<{snapshot:ConversationSnapshot;descriptor:ZoneMediaDescriptor|null}|null> {
    for(const room of OfficeRoom.roomsByOffice.get(officeId)??[]){
      const sessionId=room.sessionSecurity.activeSession(username);
      if(!sessionId||room.sessionSecurity.isRevoked(sessionId)||room.mediaIdentityBySessionId.get(sessionId)!==identity)continue;
      room.refreshConversations();
      const zoneId=room.mediaZoneBySessionId.get(sessionId)?.id;
      if(zoneId&&!(await room.privacy?.authorizeMedia(sessionId)))return null;
      room.refreshConversations();
      const snapshot=room.conversations?.snapshot(sessionId);
      if(!snapshot?.conversation||room.sessionSecurity.isRevoked(sessionId)||room.sessionSecurity.activeSession(username)!==sessionId)return null;
      return {snapshot,descriptor:zoneId?room.privacy?.descriptor(zoneId)??null:null};
    }
    return null;
  }

  static getConversationSnapshot(officeId: string, username: string, identity: string): ConversationSnapshot | null {
    for (const room of OfficeRoom.roomsByOffice.get(officeId) ?? []) {
      const sessionId = room.sessionSecurity.activeSession(username);
      if (!sessionId || room.sessionSecurity.isRevoked(sessionId) || room.mediaIdentityBySessionId.get(sessionId) !== identity) continue;
      room.refreshConversations();
      const snapshot = room.conversations?.snapshot(sessionId);
      if (snapshot?.conversation) return snapshot;
    }
    return null;
  }

  private updateMeetingMembership() {
    this.updatePrivateMembership();
  }

  static isMeetingMember(officeId: string, username: string, identity: string, roomKey = "lobby") {
    for (const room of OfficeRoom.roomsByOffice.get(officeId) ?? []) {
      for (const [sessionId, memberUsername] of room.usernamesBySessionId) {
        if (memberUsername === username && room.mediaIdentityBySessionId.get(sessionId) === identity && room.meetingMembersBySessionId.has(sessionId) && (!room.privacy || room.privacy.mayHear(sessionId,room.mediaZoneBySessionId.get(sessionId)?.id??"")) && (room.mediaZoneBySessionId.get(sessionId)?.id === roomKey) && !room.sessionSecurity.isRevoked(sessionId) && room.sessionSecurity.activeSession(username) === sessionId) return true;
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
          const id=room.privateZoneIdBySessionId.get(sessionId);return id&&(!room.privacy||room.privacy.mayHear(sessionId,id))?id:null;
        }
      }
    }
    return null;
  }

  static async getVoiceRoomForModeration(officeId: string, actorUsername: string, actorIdentity: string, targetUsername?: string) {
    const grant = await OfficeRoom.getConversationMediaGrant(officeId, actorUsername, actorIdentity);
    const conversation = grant?.snapshot.conversation;
    if (!grant || !conversation || conversation.mediaTarget.available === false) return null;
    const participantIdentities = conversation.members
      .filter(member => !targetUsername || member.username === targetUsername && member.mediaIdentity !== actorIdentity)
      .map(member => member.mediaIdentity);
    return { kind: conversation.kind, id: conversation.mediaTarget.id,
      roomName: grant.descriptor?.roomName ?? proximityRoomName(officeId, conversation.mediaTarget.id), participantIdentities };
  }

  private updatePrivateMembership() {
    const roomTransitions: MediaZoneTransition[] = [];
    for (const [sessionId, player] of this.state.players) {
      roomTransitions.push(...this.updatePlayerMediaZone(sessionId, player));
    }
    for (const transition of roomTransitions) this.notifyMediaZoneTransition(transition);

  }

  private updatePlayerMediaZone(sessionId: string, player: PlayerState): MediaZoneTransition[] {
    const previous = this.mediaZoneBySessionId.get(sessionId) ?? null;
    const current = player.presence === "online" ? zoneAtWithExitMargin({ x: player.x, z: player.z }, this.mapLayout.zones, previous?.id) : null;
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
    const { neighbors: next, candidatePairCount, possiblePairCount } = proximityNeighbors(online, this.proximityBySessionId, this.world.proximityRadius);
    realtimeRuntimeMetrics.increment("proximityPairChecks", candidatePairCount);
    realtimeRuntimeMetrics.increment("proximityPossiblePairs", possiblePairCount);
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
      // Reuse a room only while its exact membership remains current. A new
      // incarnation gets a fresh ID, so pending removals and old join tokens
      // can only affect the retired room even if the same people regroup.
      const previousGroupId = this.proximityGroupBySessionId.get(sessionId);
      const previousMembers = previousGroupId && this.proximityGroupMembersById.get(previousGroupId);
      const groupId = previousGroupId && previousMembers && sameSet(previousMembers, component)
        ? previousGroupId
        : randomBytes(PROXIMITY_GROUP_ID_BYTES).toString("hex");
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
    this.refreshConversations();
  }

  private completeAutoMoveTeleport(client: Client, player: InstanceType<typeof PlayerState>, landing: Position) {
    if (player.vehicleMode === "auto") this.exitVehicle(client.sessionId, player);
    player.x = landing.x;
    player.z = landing.z;
    player.sittingPropId = "";
    player.dancing = false;
    this.autoRoutes.delete(client.sessionId);
    this.pendingSitsBySessionId.delete(client.sessionId);
    this.autoSitScanAtBySessionId.delete(client.sessionId);
    this.seatApproachWorldsBySessionId.delete(client.sessionId);
    this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
    this.updateMeetingMembership();
    this.updatePrivateMembership();
    this.updateProximity();
    client.send("auto-move-status", { status: "arrived", teleported: true });
  }

  private clearPendingAutoMove(sessionId: string) {
    const pending = this.pendingAutoMovesBySessionId.get(sessionId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingAutoMovesBySessionId.delete(sessionId);
  }

  private queueAutoMove(client: Client, payload: unknown) {
    const sessionId = client.sessionId;
    this.clearPendingAutoMove(sessionId);
    const pending = { client, payload, timer: undefined as unknown as ReturnType<typeof setTimeout> };
    pending.timer = setTimeout(() => {
      if (this.pendingAutoMovesBySessionId.get(sessionId) !== pending) return;
      this.pendingAutoMovesBySessionId.delete(sessionId);
      if (this.clients.some((connected) => connected.sessionId === sessionId)) this.handleAutoMove(client, payload);
    }, this.routeWorkLimiter.delayMs(sessionId) + 1);
    this.pendingAutoMovesBySessionId.set(sessionId, pending);
  }

  private handleAutoMove(client: Client, payload: unknown) {
    this.deskTravel?.invalidate(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!player || !isValidAutoMoveInput(payload)) {
      client.send("auto-move-status", { status: "unreachable" });
      return;
    }
    const { x, z } = payload;
    if (Math.abs(x) > this.world.width / 2 || Math.abs(z) > this.world.depth / 2) {
      client.send("auto-move-status", { status: "unreachable" });
      return;
    }
    if (!this.routeWorkLimiter.admit(client.sessionId)) {
      this.queueAutoMove(client, payload);
      return;
    }
    this.clearPendingAutoMove(client.sessionId);
    this.navigationIntent(client.sessionId);
    this.stopFollowing(client.sessionId, "stopped", false);
    this.autoRoutes.delete(client.sessionId);
    player.sittingPropId = "";
    player.dancing = false;
    this.pendingSitsBySessionId.delete(client.sessionId);
    const previousVehicle = player.vehicleId;
    const previousVehicleMode = player.vehicleMode;
    const previousVehiclePropId = player.vehiclePropId;
    const start = { x: player.x, z: player.z };
    const intentRevision = this.routeIntentRevisionBySessionId.get(client.sessionId);
    const geometryRevision = this.navigationGeometryRevision;
    const accessSignature = this.routeAccessSignature(client.sessionId);
    const destination = { x, z };
    const destinationZone = this.mapLayout.zones
      .filter((zone) => Math.abs(x - zone.x) <= zone.width / 2 && Math.abs(z - zone.z) <= zone.depth / 2)
      .sort((a, b) => a.width * a.depth - b.width * b.depth)[0];
    const sourceZone = this.mapLayout.zones
      .filter((zone) => Math.abs(start.x - zone.x) <= zone.width / 2 && Math.abs(start.z - zone.z) <= zone.depth / 2)
      .sort((a, b) => a.width * a.depth - b.width * b.depth)[0];
    if (autoMoveTravelMode(Math.hypot(destination.x - start.x, destination.z - start.z)) === "teleport") {
      const lockedDestination = Boolean(destinationZone && !this.canEnterMediaZone(client.sessionId, destinationZone.id) && sourceZone?.id !== destinationZone.id);
      const landing = lockedDestination
        ? null
        : autoMoveLandingPoint(destination, this.movementAccessWorld(client.sessionId, this.worldForVehicle(player)), destinationZone ?? undefined);
      if (landing) {
        this.completeAutoMoveTeleport(client, player, landing);
        return;
      }
      client.send("auto-move-status", { status: "unreachable" });
      return;
    }
    const lockedDestination = Boolean(destinationZone && !this.canEnterMediaZone(client.sessionId, destinationZone.id) && sourceZone?.id !== destinationZone.id);
    if (lockedDestination) {
      client.send("auto-move-status", { status: "unreachable" });
      return;
    }
    // Auto-move vehicles are temporary. Interactively driven vehicles retain
    // their manual state and prop binding when an auto route is requested.
    const candidateVehicleId = previousVehicle || KENNEY_VEHICLE_IDS[Math.floor(Math.random() * KENNEY_VEHICLE_IDS.length)]!;
    const candidateWorld = { ...this.world, playerRadius: Math.max(this.world.playerRadius, AUTO_MOVE_VEHICLE_COLLISION_RADIUS_M) };
    if (!previousVehicle && !isPositionWalkable(start, candidateWorld)) {
      client.send("auto-move-status", { status: "unreachable" });
      return;
    }
    const routeWorld = previousVehicle
      ? { ...this.worldForVehicle(player), playerRadius: Math.max(this.world.playerRadius, AUTO_MOVE_VEHICLE_COLLISION_RADIUS_M) }
      : candidateWorld;
    // Search the same access-constrained geometry that the movement tick will
    // enforce, so a route cannot be planned through a locked room.
    const navigationWorld = this.movementAccessWorld(client.sessionId, routeWorld);
    this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
    this.pendingRouteSearchBySessionId.set(client.sessionId, intentRevision ?? -1);
    void this.searchRoute(start, destination, client.sessionId, navigationWorld).then((points) => {
      if (this.pendingRouteSearchBySessionId.get(client.sessionId) === intentRevision) this.pendingRouteSearchBySessionId.delete(client.sessionId);
      const intentStillCurrent = this.routeIntentRevisionBySessionId.get(client.sessionId) === intentRevision;
      if (!points) {
        if (intentStillCurrent && this.clients.includes(client)) client.send("auto-move-status", { status: "unreachable" });
        return;
      }
      if (!this.clients.includes(client) || this.state.players.get(client.sessionId) !== player ||
          !intentStillCurrent || this.navigationGeometryRevision !== geometryRevision ||
          !this.routeSessionIsActive(client.sessionId, player) || this.routeAccessSignature(client.sessionId) !== accessSignature ||
          Math.hypot(player.x - start.x, player.z - start.z) > 0.75) return;
      const currentZone = this.mapLayout.zones
        .filter((zone) => Math.abs(x - zone.x) <= zone.width / 2 && Math.abs(z - zone.z) <= zone.depth / 2)
        .sort((a, b) => a.width * a.depth - b.width * b.depth)[0];
      if (currentZone && !this.canEnterMediaZone(client.sessionId, currentZone.id) && sourceZone?.id !== currentZone.id) {
        client.send("auto-move-status", { status: "unreachable" });
        return;
      }
      const currentWorld = this.movementAccessWorld(client.sessionId, {
        ...(previousVehicle ? this.worldForVehicle(player) : this.world),
        playerRadius: Math.max(this.world.playerRadius, AUTO_MOVE_VEHICLE_COLLISION_RADIUS_M),
      });
      if (!routeIsWalkable(start, points, currentWorld) || !isPositionWalkable(destination, currentWorld)) {
        client.send("auto-move-status", { status: "unreachable" });
        return;
      }
      if (!previousVehicle) {
        player.vehicleId = candidateVehicleId;
        player.vehicleMode = "auto";
        player.vehiclePropId = "";
      }
      this.autoRoutes.set(client.sessionId, { points, index: 0, stalledTicks: 0, driveSpeedMps: autoMoveDriveSpeed(start, points, this.world.movementSpeed * 5), destination });
      this.pendingSitsBySessionId.delete(client.sessionId);
      if (!previousVehicle && player.vehicleId) {
        const username = this.usernamesBySessionId.get(client.sessionId);
        if (username) void recordOfficeActivity(this.officeId, username, "vehicle.enter", player.vehicleId);
      }
      client.send("auto-move-status", { status: "started", randomVehicle: Boolean(player.vehicleId), vehicleId: player.vehicleId });
    });
  }

  private handleAutoMoveToPlayer(client: Client, payload: unknown) {
    this.deskTravel?.invalidate(client.sessionId);
    if (!isValidTargetPlayerInput(payload)) return;
    const follower = this.state.players.get(client.sessionId);
    const target = this.state.players.get(payload.targetSessionId);
    if (!follower || !target || target.presence !== "online" || client.sessionId === payload.targetSessionId) {
      client.send("auto-move-status", { status: "unreachable" });
      return;
    }
    if (!this.routeWorkLimiter.admit(client.sessionId)) {
      client.send("auto-move-status", { status: "blocked" });
      return;
    }
    this.navigationIntent(client.sessionId);
    this.stopFollowing(client.sessionId, "stopped", false);
    this.autoRoutes.delete(client.sessionId);
    const previousVehicleId = follower.vehicleId;
    const previousVehicleMode = follower.vehicleMode;
    const previousVehiclePropId = follower.vehiclePropId;
    const intentRevision = this.routeIntentRevisionBySessionId.get(client.sessionId);
    const geometryRevision = this.navigationGeometryRevision;
    const accessSignature = this.routeAccessSignature(client.sessionId);
    const targetPosition = { x: target.x, z: target.z };
    const destination = this.followApproachPoint(client.sessionId, follower, target);
    const travelDistance = Math.hypot(destination.x - follower.x, destination.z - follower.z);
    if (autoMoveTravelMode(travelDistance) === "teleport") {
      const destinationZone = zoneAtWithExitMargin(destination, this.mapLayout.zones);
      const lockedDestination = Boolean(destinationZone && !this.canEnterMediaZone(client.sessionId, destinationZone.id));
      const landing = lockedDestination
        ? null
        : autoMoveLandingPoint(destination, this.movementAccessWorld(client.sessionId, this.worldForVehicle(follower)), destinationZone ?? undefined);
      if (landing) {
        this.completeAutoMoveTeleport(client, follower, landing);
        return;
      }
      client.send("auto-move-status", { status: "unreachable" });
      return;
    }
    const start = { x: follower.x, z: follower.z };
    const candidateVehicleId = previousVehicleId || KENNEY_VEHICLE_IDS[Math.floor(Math.random() * KENNEY_VEHICLE_IDS.length)]!;
    const routeWorld = previousVehicleId
      ? { ...this.worldForVehicle(follower), playerRadius: Math.max(this.world.playerRadius, AUTO_MOVE_VEHICLE_COLLISION_RADIUS_M) }
      : { ...this.world, playerRadius: Math.max(this.world.playerRadius, AUTO_MOVE_VEHICLE_COLLISION_RADIUS_M) };
    if (!previousVehicleId && !isPositionWalkable(start, routeWorld)) {
      client.send("auto-move-status", { status: "unreachable" });
      return;
    }
    this.movementInputs.set(client.sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
    const navigationWorld = this.movementAccessWorld(client.sessionId, routeWorld);
    this.pendingRouteSearchBySessionId.set(client.sessionId, intentRevision ?? -1);
    void this.searchRoute(start, destination, client.sessionId, navigationWorld).then((points) => {
      if (this.pendingRouteSearchBySessionId.get(client.sessionId) === intentRevision) this.pendingRouteSearchBySessionId.delete(client.sessionId);
      const intentStillCurrent = this.routeIntentRevisionBySessionId.get(client.sessionId) === intentRevision;
      if (!points) {
        if (intentStillCurrent && this.clients.includes(client)) client.send("auto-move-status", { status: "unreachable" });
        return;
      }
      if (!this.clients.includes(client) || this.state.players.get(client.sessionId) !== follower ||
          !intentStillCurrent || this.navigationGeometryRevision !== geometryRevision ||
          !this.routeSessionIsActive(client.sessionId, follower) || this.routeAccessSignature(client.sessionId) !== accessSignature ||
          Math.hypot(follower.x - start.x, follower.z - start.z) > 0.75) return;
      const currentTarget = this.state.players.get(payload.targetSessionId);
      if (currentTarget !== target || !currentTarget || currentTarget.presence !== "online" ||
          Math.hypot(currentTarget.x - targetPosition.x, currentTarget.z - targetPosition.z) > 0.65) return;
      const currentDestination = this.followApproachPoint(client.sessionId, follower, currentTarget);
      const currentWorld = this.movementAccessWorld(client.sessionId, {
        ...(previousVehicleId ? this.worldForVehicle(follower) : this.world),
        playerRadius: Math.max(this.world.playerRadius, AUTO_MOVE_VEHICLE_COLLISION_RADIUS_M),
      });
      if (!routeIsWalkable(start, points, currentWorld) || !isPositionWalkable(currentDestination, currentWorld)) {
        client.send("auto-move-status", { status: "unreachable" });
        return;
      }
      if (!previousVehicleId) { follower.vehicleId = candidateVehicleId; follower.vehicleMode = "auto"; follower.vehiclePropId = ""; }
      this.autoRoutes.set(client.sessionId, { points, index: 0, stalledTicks: 0, driveSpeedMps: autoMoveDriveSpeed(start, points, this.world.movementSpeed * 5) });
      this.pendingSitsBySessionId.delete(client.sessionId);
      if (!previousVehicleId && follower.vehicleId) {
        const username = this.usernamesBySessionId.get(client.sessionId);
        if (username) void recordOfficeActivity(this.officeId, username, "vehicle.enter", follower.vehicleId);
      }
      client.send("auto-move-status", { status: "started", randomVehicle: Boolean(follower.vehicleId), vehicleId: follower.vehicleId });
    });
  }

  private handleFollowPlayer(client: Client, payload: unknown) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!isValidTargetPlayerInput(payload)) return;
    if (!this.routeWorkLimiter.admit(client.sessionId)) return;
    this.navigationIntent(client.sessionId);
    this.startFollowing(client.sessionId, payload.targetSessionId);
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
    this.deskTravel?.invalidate(followerSessionId);
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
    const now = performance.now();
    const follow: ActiveFollow = {
      targetSessionId,
      nextRepathAt: now + 350,
      lastTargetX: target.x,
      lastTargetZ: target.z,
      initialPending: true,
    };
    this.activeFollowsBySessionId.set(followerSessionId, follow);
    this.movementInputs.set(followerSessionId, { x: 0, z: 0, sprint: false, receivedAt: now });
    if (Math.hypot(destination.x - follower.x, destination.z - follower.z) <= 1.45) {
      this.finishInitialFollow(followerSessionId, follow, follower, target);
      return;
    }
    this.requestFollowRoute(followerSessionId, follow, follower, target);
  }

  private finishInitialFollow(followerSessionId: string, follow: ActiveFollow, follower: InstanceType<typeof PlayerState>, target: InstanceType<typeof PlayerState>) {
    follow.initialPending = false;
    follow.lastTargetX = target.x;
    follow.lastTargetZ = target.z;
    follow.nextRepathAt = performance.now() + 350;
    const followerName = follower.displayName || this.usernamesBySessionId.get(followerSessionId) || "Someone";
    this.clients.find((client) => client.sessionId === followerSessionId)?.send("follow-status", { status: "started", targetSessionId: follow.targetSessionId, targetName: target.displayName });
    this.clients.find((client) => client.sessionId === follow.targetSessionId)?.send("follow-alert", { followerSessionId, followerName });
  }

  private requestFollowRoute(followerSessionId: string, follow: ActiveFollow, follower: InstanceType<typeof PlayerState>, target: InstanceType<typeof PlayerState>) {
    if (follow.repathPending || this.activeFollowsBySessionId.get(followerSessionId) !== follow) return;
    const start = { x: follower.x, z: follower.z };
    const targetPosition = { x: target.x, z: target.z };
    const destination = this.followApproachPoint(followerSessionId, follower, target);
    const distance = Math.hypot(destination.x - start.x, destination.z - start.z);
    if (distance <= 1.45) {
      if (follow.initialPending) this.finishInitialFollow(followerSessionId, follow, follower, target);
      else {
        follow.lastTargetX = target.x; follow.lastTargetZ = target.z; follow.nextRepathAt = performance.now() + 350;
        const route = this.autoRoutes.get(followerSessionId);
        if (route?.followTargetSessionId === follow.targetSessionId) this.autoRoutes.delete(followerSessionId);
      }
      return;
    }
    const intentRevision = this.routeIntentRevisionBySessionId.get(followerSessionId);
    const geometryRevision = this.navigationGeometryRevision;
    const accessSignature = this.routeAccessSignature(followerSessionId);
    const navigationWorld = this.movementAccessWorld(followerSessionId, follower.vehicleId
      ? { ...this.worldForVehicle(follower), playerRadius: Math.max(this.world.playerRadius, AUTO_MOVE_VEHICLE_COLLISION_RADIUS_M) }
      : this.world);
    follow.repathPending = true;
    void this.searchRoute(start, destination, followerSessionId, navigationWorld, "follow").then((points) => {
      if (this.activeFollowsBySessionId.get(followerSessionId) !== follow) return;
      follow.repathPending = false;
      const currentFollower = this.state.players.get(followerSessionId);
      const currentTarget = this.state.players.get(follow.targetSessionId);
      if (currentFollower !== follower || currentTarget !== target || target.presence !== "online") {
        this.stopFollowing(followerSessionId, "target-left");
        return;
      }
      if (this.routeIntentRevisionBySessionId.get(followerSessionId) !== intentRevision || this.navigationGeometryRevision !== geometryRevision ||
          !this.routeSessionIsActive(followerSessionId, follower) || this.routeAccessSignature(followerSessionId) !== accessSignature) {
        follow.nextRepathAt = performance.now();
        return;
      }
      const currentDestination = this.followApproachPoint(followerSessionId, follower, target);
      if (Math.hypot(follower.x - start.x, follower.z - start.z) > 1.25 ||
          Math.hypot(target.x - targetPosition.x, target.z - targetPosition.z) > 0.65 ||
          Math.hypot(currentDestination.x - destination.x, currentDestination.z - destination.z) > 0.65) {
        follow.nextRepathAt = performance.now();
        return;
      }
      if (!points) {
        if (follow.initialPending) {
          this.activeFollowsBySessionId.delete(followerSessionId);
          this.clients.find((client) => client.sessionId === followerSessionId)?.send("follow-status", { status: "unreachable", targetSessionId: follow.targetSessionId });
        } else follow.nextRepathAt = performance.now() + 350;
        return;
      }
      const currentRouteWorld = this.movementAccessWorld(followerSessionId, follower.vehicleId
        ? { ...this.worldForVehicle(follower), playerRadius: Math.max(this.world.playerRadius, AUTO_MOVE_VEHICLE_COLLISION_RADIUS_M) }
        : this.world);
      if (!routeIsWalkable(start, points, currentRouteWorld)) { follow.nextRepathAt = performance.now(); return; }
      follow.lastTargetX = target.x;
      follow.lastTargetZ = target.z;
      follow.nextRepathAt = performance.now() + 350;
      if (points.length) this.autoRoutes.set(followerSessionId, { points, index: 0, stalledTicks: 0, followTargetSessionId: follow.targetSessionId });
      else {
        const route = this.autoRoutes.get(followerSessionId);
        if (route?.followTargetSessionId === follow.targetSessionId) this.autoRoutes.delete(followerSessionId);
      }
      if (follow.initialPending) this.finishInitialFollow(followerSessionId, follow, follower, target);
    });
  }

  private stopFollowing(followerSessionId: string, reason: "stopped" | "cancelled" | "target-left" | "blocked" = "stopped", notifyFollower = true) {
    this.invalidateRouteIntent(followerSessionId);
    this.deskTravel?.invalidate(followerSessionId);
    const follow = this.activeFollowsBySessionId.get(followerSessionId);
    if (!follow) return;
    this.activeFollowsBySessionId.delete(followerSessionId);
    const route = this.autoRoutes.get(followerSessionId);
    if (route?.followTargetSessionId === follow.targetSessionId) this.autoRoutes.delete(followerSessionId);
    const follower = this.state.players.get(followerSessionId);
    if (follower?.vehicleMode === "auto") this.exitVehicle(followerSessionId, follower);
    const followerClient = this.clients.find((client) => client.sessionId === followerSessionId);
    if (notifyFollower) followerClient?.send("follow-status", { status: reason, targetSessionId: follow.targetSessionId });
    if (!follow.initialPending) this.clients.find((client) => client.sessionId === follow.targetSessionId)?.send("follow-ended", { followerSessionId, reason });
  }

  private parseMapLayout(config: unknown) {
    realtimeRuntimeMetrics.increment("mapParses");
    return readRoomLayout(config);
  }

  private previousTickStartedAtMs: number | undefined;
  private nextSpatialProjectionAtMs = 0;
  private spatialProjectionDirty = true;
  private step(deltaSeconds: number) {
    const startedAtMs = performance.now();
    const previousStartedAtMs = this.previousTickStartedAtMs;
    this.previousTickStartedAtMs = startedAtMs;
    this.steppingMovement = true;
    try { this.stepWork(deltaSeconds); }
    finally {
      this.steppingMovement = false;
      if (this.vehicleCollisionRefreshPending) this.refreshVehicleCollisionWorlds();
      realtimeRuntimeMetrics.recordTick(performance.now() - startedAtMs, previousStartedAtMs === undefined ? undefined : startedAtMs - previousStartedAtMs);
    }
  }

  private stepWork(deltaSeconds: number) {
    if (this.state.players.size === 0 && !this.privacy?.deadlineDue()) {
      realtimeRuntimeMetrics.increment("emptyRoomTickSkips");
      return;
    }
    const now = performance.now();
    const budget = new RouteSearchBudget();
    for (const [followerSessionId, follow] of this.activeFollowsBySessionId) {
      const follower = this.state.players.get(followerSessionId);
      const target = this.state.players.get(follow.targetSessionId);
      if (!follower || !target || target.presence !== "online" || follower.vehicleMode === "manual") {
        this.stopFollowing(followerSessionId, "target-left");
        continue;
      }
      const targetMoved = Math.hypot(target.x - follow.lastTargetX, target.z - follow.lastTargetZ) >= 0.65;
      if (now < follow.nextRepathAt || (!follow.initialPending && !targetMoved) || follow.repathPending || budget.exhausted || !this.routeWorkLimiter.admit(followerSessionId)) continue;
      follow.nextRepathAt = now + 350;
      this.requestFollowRoute(followerSessionId, follow, follower, target);
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
      if (intent.x === 0 && intent.z === 0 && !route && !player.vehicleId && !seatApproach
        && now < (this.autoSitScanAtBySessionId.get(sessionId) ?? 0)
        && player.rotation === resolvePlayerFacing({ input: intent, seated: Boolean(player.sittingPropId), inVehicle: false, currentRotation: player.rotation })) {
        realtimeRuntimeMetrics.increment("stationaryTickSkips");
        continue;
      }
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
        ? { ...this.worldForVehicle(player), playerRadius: Math.max(this.world.playerRadius, AUTO_MOVE_VEHICLE_COLLISION_RADIUS_M), movementSpeed: route?.driveSpeedMps ?? this.world.movementSpeed * (intent.sprint ? 10 : 5) }
        : route?.sitOnArrivalPropId && seatApproach
          ? { ...seatApproach.world, movementSpeed: this.world.movementSpeed * NORMAL_WALK_SPEED_MULTIPLIER * (intent.sprint ? 2 : 1) }
          : seatApproach && stillInsideVehicle
            ? { ...seatApproach.world, movementSpeed: this.world.movementSpeed * NORMAL_WALK_SPEED_MULTIPLIER * (intent.sprint ? 2 : 1) }
        : { ...this.world, movementSpeed: this.world.movementSpeed * NORMAL_WALK_SPEED_MULTIPLIER * (intent.sprint ? 2 : 1) };
      if (this.ghostModeBySessionId.get(sessionId) && !route) movementWorld = ghostCollisionWorld(movementWorld);
      if (route) movementWorld = this.movementAccessWorld(sessionId, movementWorld);
      let movementSeconds = deltaSeconds;
      if (route && intent.x === 0 && intent.z === 0) {
        const target = route.points[route.index];
        if (!target) {
          if (!route.followTargetSessionId) {
            if (player.vehicleMode === "auto") this.exitVehicle(sessionId, player);
            if (route.sitOnArrivalPropId) {
              if (this.seatPlayerOnProp(player, route.sitOnArrivalPropId)) this.seatApproachWorldsBySessionId.delete(sessionId);
              else if (route.sitOnArrivalZoneId && this.routeToAvailableSeat(sessionId, player, route.sitOnArrivalZoneId, budget)) continue;
              else this.seatApproachWorldsBySessionId.delete(sessionId);
            } else if (route.sitOnArrivalZoneId && this.routeToAvailableSeat(sessionId, player, route.sitOnArrivalZoneId, budget)) continue;
            this.clients.find((client) => client.sessionId === sessionId)?.send("auto-move-status", { status: "arrived" });
          }
          this.autoRoutes.delete(sessionId);
        } else {
          const dx = target.x - player.x;
          const dz = target.z - player.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.035) {
            route.index += 1;
            if (route.index >= route.points.length) {
              if (!route.followTargetSessionId) {
                if (player.vehicleMode === "auto") this.exitVehicle(sessionId, player);
                if (route.sitOnArrivalPropId) {
                  if (this.seatPlayerOnProp(player, route.sitOnArrivalPropId)) this.seatApproachWorldsBySessionId.delete(sessionId);
                  else if (route.sitOnArrivalZoneId && this.routeToAvailableSeat(sessionId, player, route.sitOnArrivalZoneId, budget)) continue;
                  else this.seatApproachWorldsBySessionId.delete(sessionId);
                } else if (route.sitOnArrivalZoneId && this.routeToAvailableSeat(sessionId, player, route.sitOnArrivalZoneId, budget)) continue;
                this.clients.find((client) => client.sessionId === sessionId)?.send("auto-move-status", { status: "arrived" });
              }
              this.autoRoutes.delete(sessionId);
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
      const currentPosition = { x: player.x, z: player.z };
      const next = movePlayer(currentPosition, intent, movementSeconds, movementWorld);
      const previousZoneId = this.mediaZoneBySessionId.get(sessionId)?.id ?? null;
      const destinationZone = zoneAtWithExitMargin(next, this.mapLayout.zones);
      const blockedByLockedZone = Boolean(destinationZone && destinationZone.id !== previousZoneId && !this.canEnterMediaZone(sessionId,destinationZone.id));
      if (blockedByLockedZone) {
        next.x = player.x;
        next.z = player.z;
      } else if (!this.ghostModeBySessionId.get(sessionId) && !player.vehicleId && (intent.x !== 0 || intent.z !== 0)) {
        const withoutProps = movePlayer(currentPosition, intent, movementSeconds, ghostCollisionWorld(movementWorld));
        const withoutPropsZone = zoneAtWithExitMargin(withoutProps, this.mapLayout.zones);
        const wouldEnterLockedZone = Boolean(withoutPropsZone && withoutPropsZone.id !== previousZoneId && !this.canEnterMediaZone(sessionId,withoutPropsZone.id));
        const lastHintAt = this.ghostHintAtBySessionId.get(sessionId);
        const cooldownElapsed = lastHintAt === undefined || now - lastHintAt >= 3_500;
        if (!wouldEnterLockedZone && cooldownElapsed && movementBlockedByProps(next, withoutProps)) {
          this.ghostHintAtBySessionId.set(sessionId, now);
          this.clients.find((client) => client.sessionId === sessionId)?.send("ghost-mode-hint", {});
        }
      }
      if (route && (intent.x !== 0 || intent.z !== 0)) {
        const actualStep = Math.hypot(next.x - player.x, next.z - player.z);
        route.stalledTicks = actualStep < 0.0001 ? route.stalledTicks + 1 : 0;
        if (route.stalledTicks >= 12) {
          if (budget.exhausted) continue;
          this.autoRoutes.delete(sessionId);
          if (route.followTargetSessionId) this.stopFollowing(sessionId, "blocked");
          else {
            this.clients.find((client) => client.sessionId === sessionId)?.send("auto-move-status", { status: "blocked" });
          }
        }
      }
      if (player.x !== next.x || player.z !== next.z) this.spatialProjectionDirty = true;
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
        this.autoSitScanAtBySessionId.delete(sessionId);
      } else {
        const pendingSit = this.pendingSitsBySessionId.get(sessionId);
        const pendingPositionChanged = pendingSit && Math.hypot(player.x - pendingSit.x, player.z - pendingSit.z) > 0.08;
        const shouldScanForSeat = pendingSit
          ? pendingPositionChanged || now - pendingSit.startedAt >= autoSitDelayMs
          : now >= (this.autoSitScanAtBySessionId.get(sessionId) ?? 0);
        if (shouldScanForSeat) {
          this.autoSitScanAtBySessionId.set(sessionId, now + AUTO_SIT_SCAN_INTERVAL_MS);
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
          const nearbySeat = this.seatIndex.nearest(player, autoSitSeatRadius, occupiedSeatIds);
          if (!nearbySeat) {
            this.pendingSitsBySessionId.delete(sessionId);
          } else if (!pendingSit || pendingSit.propId !== nearbySeat.seatId || pendingPositionChanged) {
            this.pendingSitsBySessionId.set(sessionId, { propId: nearbySeat.seatId, startedAt: now, x: player.x, z: player.z });
          } else if (now - pendingSit.startedAt >= autoSitDelayMs) {
            // Keep the authoritative player position where it is: snapping it
            // onto the chair would put it inside the chair's movement blocker,
            // making the first movement input appear stuck. The renderer uses
            // sittingPropId to place the avatar visually on the chair.
            player.rotation = Math.atan2(nearbySeat.prop.x - player.x, nearbySeat.prop.z - player.z);
            player.sittingPropId = nearbySeat.seatId;
            this.pendingSitsBySessionId.delete(sessionId);
            this.autoSitScanAtBySessionId.delete(sessionId);
          }
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
    if (this.spatialProjectionDirty || now >= this.nextSpatialProjectionAtMs || this.privacy?.deadlineDue()) {
      this.spatialProjectionDirty = false;
      this.nextSpatialProjectionAtMs = now + SPATIAL_PROJECTION_INTERVAL_MS;
      this.updateMeetingMembership();
      this.updateProximity();
    }
  }

  private exitVehicle(sessionId: string, player: InstanceType<typeof PlayerState>) {
    if (!player.vehicleId) return false;
    const prop=player.vehiclePropId?this.mapLayout.props.find(item=>item.id===player.vehiclePropId):undefined;
    const footprint=prop?roomPropCollisionFootprint({...prop,rotation:player.rotation}):undefined;
    const exitWorld=this.movementAccessWorld(sessionId,this.worldForVehicle(player));
    const occupied=[...this.state.players.entries()].filter(([id])=>id!==sessionId).map(([,other])=>({x:other.x,z:other.z}));
    const exit=vehicleExitPosition(player,footprint,exitWorld,occupied);
    if(!exit)return false;
    const exitedVehicleId=player.vehicleId;
    this.spatialProjectionDirty = true;
    const username=this.usernamesBySessionId.get(sessionId);
    if(player.vehiclePropId){player.vehiclePropX=player.x;player.vehiclePropZ=player.z;player.vehiclePropRotation=player.rotation;}
    player.x=exit.x;player.z=exit.z;player.sittingPropId="";player.vehicleId="";player.vehicleMode="";
    if(player.vehiclePropId)this.refreshVehicleCollisionWorlds();
    if(username)void recordOfficeActivity(this.officeId,username,"vehicle.leave",exitedVehicleId);
    this.clients.find(client=>client.sessionId===sessionId)?.send("vehicle-exited",{});
    return true;
  }

  private seatPlayerOnProp(player: InstanceType<typeof PlayerState>, seatReference: string) {
    const seat = parseRoomPropSeatReference(seatReference);
    const prop = this.mapLayout.props.find((item) => item.id === seat.propId);
    const definition = prop && propDefinitionByAsset.get(prop.asset);
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

  private finishSeatSearchWithoutRoute(sessionId: string) {
    this.pendingSeatSearchBySessionId.delete(sessionId);
    this.seatSearchRetryAtBySessionId.delete(sessionId);
    this.seatSearchRetryCountBySessionId.delete(sessionId);
    this.autoRoutes.delete(sessionId);
    this.clients.find((client) => client.sessionId === sessionId)?.send("auto-move-status", { status: "arrived" });
  }

  private deferSeatSearchRetry(sessionId: string) {
    const retries = (this.seatSearchRetryCountBySessionId.get(sessionId) ?? 0) + 1;
    if (retries >= MAX_SEAT_WORKER_RETRIES) {
      this.finishSeatSearchWithoutRoute(sessionId);
      return;
    }
    this.seatSearchRetryCountBySessionId.set(sessionId, retries);
    this.seatSearchRetryAtBySessionId.set(sessionId, performance.now() + SEAT_WORKER_RETRY_INTERVAL_MS);
  }

  private routeToAvailableSeat(sessionId: string, player: InstanceType<typeof PlayerState>, zoneId: string, budget: RouteSearchBudget) {
    // Keep the caller's arrival route installed while one bounded worker job is pending.
    if (this.pendingSeatSearchBySessionId.has(sessionId) || budget.exhausted ||
        (this.seatSearchRetryAtBySessionId.get(sessionId) ?? 0) > performance.now()) return true;
    const zone = this.mapLayout.zones.find((item) => item.id === zoneId);
    if (!zone) return false;
    const occupiedSeatIds = new Set([...this.state.players.values()]
      .filter((other) => other.presence === "online" && Boolean(other.sittingPropId))
      .map((other) => other.sittingPropId));
    const hasSeat = this.mapLayout.props.some((prop) => propDefinitionByAsset.get(prop.asset)?.interaction === "sit"
      && Math.abs(prop.x - zone.x) <= zone.width / 2 && Math.abs(prop.z - zone.z) <= zone.depth / 2);
    if (!hasSeat) return false;
    const start = { x: player.x, z: player.z };
    const previousSeatWorld = this.seatApproachWorldsBySessionId.get(sessionId)?.world;
    const baseWorld = this.worldForVehicle(player);
    const requestWorld = this.movementAccessWorld(sessionId, {
      ...baseWorld,
      ...(previousSeatWorld?.excludedVehiclePropId ? { excludedVehiclePropId: previousSeatWorld.excludedVehiclePropId } : {}),
      playerRadius: this.world.playerRadius,
    });
    const pending: PendingSeatSearch = {
      player,
      start,
      intentRevision: this.routeIntentRevisionBySessionId.get(sessionId),
      geometryRevision: this.navigationGeometryRevision,
      accessSignature: this.routeAccessSignature(sessionId),
      zoneId,
    };
    this.pendingSeatSearchBySessionId.set(sessionId, pending);
    void this.submitRouteSearch({
      start,
      destination: start,
      sessionId,
      world: requestWorld,
      priority: "seat",
      mode: "seat",
      seatSearch: { zoneId, occupiedSeatIds: [...occupiedSeatIds], preferredPoint: start },
    }).then((result) => {
      if (this.pendingSeatSearchBySessionId.get(sessionId) !== pending) return;
      this.pendingSeatSearchBySessionId.delete(sessionId);
      if (!result) { this.deferSeatSearchRetry(sessionId); return; }
      if (result.points === null) { this.finishSeatSearchWithoutRoute(sessionId); return; }
      const retry = () => this.deferSeatSearchRetry(sessionId);
      if (!result.propId || result.zoneId !== zoneId ||
          this.state.players.get(sessionId) !== player || this.routeIntentRevisionBySessionId.get(sessionId) !== pending.intentRevision ||
          this.navigationGeometryRevision !== pending.geometryRevision || this.routeAccessSignature(sessionId) !== pending.accessSignature ||
          !this.routeSessionIsActive(sessionId, player) || Math.hypot(player.x - start.x, player.z - start.z) > 0.75) { retry(); return; }
      const currentZone = this.mapLayout.zones.find((item) => item.id === zoneId);
      if (!currentZone || currentZone.kind !== zone.kind || currentZone.x !== zone.x || currentZone.z !== zone.z ||
          currentZone.width !== zone.width || currentZone.depth !== zone.depth) { retry(); return; }
      let seatReference: string;
      try {
        const parsed = parseRoomPropSeatReference(result.propId);
        seatReference = roomPropSeatReference(parsed.propId, parsed.seatIndex);
      } catch { retry(); return; }
      const prop = this.mapLayout.props.find((item) => item.id === parseRoomPropSeatReference(seatReference).propId);
      const definition = prop && propDefinitionByAsset.get(prop.asset);
      if (!prop || definition?.interaction !== "sit" ||
          Math.abs(prop.x - currentZone.x) > currentZone.width / 2 || Math.abs(prop.z - currentZone.z) > currentZone.depth / 2 ||
          !roomPropSeatAnchors(prop, definition).some((anchor) => roomPropSeatReference(prop.id, anchor.index) === seatReference)) { retry(); return; }
      const occupied = [...this.state.players.values()].some((other) => {
        if (other === player || other.presence !== "online" || !other.sittingPropId) return false;
        try {
          const seat = parseRoomPropSeatReference(other.sittingPropId);
          return roomPropSeatReference(seat.propId, seat.seatIndex) === seatReference;
        } catch { return false; }
      });
      if (occupied) { retry(); return; }
      const currentWorld = this.movementAccessWorld(sessionId, {
        ...this.worldForVehicle(player),
        ...(previousSeatWorld?.excludedVehiclePropId ? { excludedVehiclePropId: previousSeatWorld.excludedVehiclePropId } : {}),
        playerRadius: this.world.playerRadius,
      });
      if (!routeIsWalkable(start, result.points, currentWorld)) { retry(); return; }
      this.seatSearchRetryAtBySessionId.delete(sessionId);
      this.autoRoutes.set(sessionId, {
        points: result.points,
        index: 0,
        stalledTicks: 0,
        sitOnArrivalPropId: seatReference,
        sitOnArrivalZoneId: zoneId,
      });
      this.movementInputs.set(sessionId, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
    }).catch(() => {
      if (this.pendingSeatSearchBySessionId.get(sessionId) === pending) {
        this.pendingSeatSearchBySessionId.delete(sessionId);
        this.deferSeatSearchRetry(sessionId);
      }
    });
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
