export { isValidAutoMoveInput, isValidTargetPlayerInput } from "./routeInputs.js";
export * from "./privateConversations.js";
export * from "./mediaModeration.js";
export * from "./meetOffers.js";
export * from "./conversationListening.js";
export * from "./conversation.js";
export * from "./chat.js";
export * from "./reactions.js";
export * from "./spotlight.js";
export * from "./propInteraction.js";
import { zoneAtWithExitMargin } from "./zoneMembership.js";
export { ZONE_EXIT_MARGIN_M } from "./zoneMembership.js";
import { roomBoundaryWalls, roomWallSolidSegments } from "./roomWallSegments.js";
import type { MovementInput } from "./inputDelivery.js";
import { schema, t } from "@colyseus/schema";
import { CAMPUS_LAYOUT, campusPropPlacements } from "./campusLayout.js";
import { readRoomLayout, roomPropCollisionClearanceRadius, roomPropCollisionFootprint } from "./roomLayout.js";
import { isRoomWallProp } from "./roomWallProps.js";
import type { RoomLayout } from "./roomLayout.js";

export { roomBoundaryWalls, roomWallSolidSegments } from "./roomWallSegments.js";
export { isRoomWallProp } from "./roomWallProps.js";
export { CAMPUS_COUNTS, CAMPUS_LAYOUT, campusPropPlacements, legacyPortalToCampus } from "./campusLayout.js";
export type { CampusPropPlacement, CampusRoom, CampusRoomKind } from "./campusLayout.js";
export { ROOM_DOOR_FRAME_ASSETS, ROOM_PROP_CATALOG, ROOM_WALL_MODEL_ASSETS, parseRoomPropSeatReference, readRoomLayout, roomPropCollisionClearanceRadius, roomPropCollisionFootprint, roomPropPlacementSupport, roomPropSeatAnchors, roomPropSeatReference, type RoomLayoutRoadway, type RoomPropSeatAnchor } from "./roomLayout.js";
export { generateCampusMap, TEMPLATE_PRIVATE_WALL_ASSETS, templatePrivateWallAsset, type CampusMapGeneratorInputs, type GeneratedCampusMap } from "./campusMapGenerator.js";
export { createCampusOfficeDraft, type CampusInteriorPreset } from "./campusFurnishing.js";
export { MAX_OFFICE_PROPS } from "./officePropLimits.js";
export type { RoomPropDefinition } from "./roomLayout.js";
export type { OfficePropsSnapshot, RoomLayout, RoomLayoutDoor, RoomLayoutProp, RoomLayoutWall, RoomLayoutZone } from "./roomLayout.js";

export { INPUT_MIN_INTERVAL_MS, INPUT_HEARTBEAT_INTERVAL_MS, InputSendGate, RECONNECTION_SEAT_TIMEOUT_SECONDS } from "./inputDelivery.js";
export type { MovementInput } from "./inputDelivery.js";
export { FULL_TURN_RAD, shortestAngleDelta, lerpAngle } from "./angles.js";
export { resolvePlayerFacing } from "./playerFacing.js";
export { JUMP_DURATION_MS, JUMP_HEIGHT_M, isValidJumpInput, isValidJumpEvent, jumpHeightAt } from "./jump.js";

export const KENNEY_CHARACTER_IDS = [
  "character-female-a", "character-female-b", "character-female-c", "character-female-d", "character-female-e", "character-female-f",
  "character-male-a", "character-male-b", "character-male-c", "character-male-d", "character-male-e", "character-male-f",
  "character-blocky-a", "character-blocky-b", "character-blocky-c", "character-blocky-d", "character-blocky-e", "character-blocky-f",
  "character-blocky-g", "character-blocky-h", "character-blocky-i", "character-blocky-j", "character-blocky-k", "character-blocky-l",
  "character-blocky-m", "character-blocky-n", "character-blocky-o", "character-blocky-p", "character-blocky-q", "character-blocky-r",
  "character-zombie-matt",
  "character-pm-jimmy", "character-pm-old-moustache", "character-pm-cappy", "character-pm-observer", "character-pm-hugo",
  "character-pm-chill", "character-pm-retroman", "character-pm-kate", "character-pm-mafiossini", "character-pm-david",
  "character-pm-samuela", "character-pm-jennifer", "character-pm-erika", "character-pm-lydia", "character-pm-olivia",
  "character-pm-rose", "character-pm-shiro", "character-pm-kyle", "character-pm-robert", "character-pm-lilbro",
  "character-pm-mikel", "character-pm-baldman",
  "character-kaykit-barbarian", "character-kaykit-knight", "character-kaykit-mage", "character-kaykit-ranger",
  "character-kaykit-rogue", "character-kaykit-rogue-hooded",
] as const;
export type KenneyCharacterId = typeof KENNEY_CHARACTER_IDS[number];
export const DEFAULT_CHARACTER_ID: KenneyCharacterId = "character-female-a";

export const KENNEY_PET_IDS = [
  "animal-beaver", "animal-bee", "animal-bunny", "animal-cat", "animal-caterpillar", "animal-chick",
  "animal-cow", "animal-crab", "animal-deer", "animal-dog", "animal-elephant", "animal-fish",
  "animal-fox", "animal-giraffe", "animal-hog", "animal-koala", "animal-lion", "animal-monkey",
  "animal-panda", "animal-parrot", "animal-penguin", "animal-pig", "animal-polar", "animal-tiger",
  "quaternius-monster-alien", "quaternius-monster-alien-tall", "quaternius-monster-bat", "quaternius-monster-bee",
  "quaternius-monster-cactus", "quaternius-monster-chicken", "quaternius-monster-crab", "quaternius-monster-cthulhu",
  "quaternius-monster-cyclops", "quaternius-monster-deer", "quaternius-monster-demon", "quaternius-monster-ghost",
  "quaternius-monster-green-demon", "quaternius-monster-mushroom", "quaternius-monster-panda", "quaternius-monster-penguin",
  "quaternius-monster-pig", "quaternius-monster-skull", "quaternius-monster-tree", "quaternius-monster-yellow-dragon",
  "quaternius-monster-yeti",
  "gobkit-pet-minion-a01", "gobkit-pet-minion-a02", "gobkit-pet-minion-b01", "gobkit-pet-minion-b02",
  "gobkit-pet-minion-c01", "gobkit-pet-minion-c02", "gobkit-pet-minion-d01", "gobkit-pet-minion-d02",
  "gobkit-pet-animal-anglerfish", "gobkit-pet-animal-bat", "gobkit-pet-animal-corgi", "gobkit-pet-animal-duck",
  "gobkit-pet-animal-hippo", "gobkit-pet-animal-jellyfish", "gobkit-pet-animal-platypus", "gobkit-pet-animal-red",
  "gobkit-pet-animal-rhino", "gobkit-pet-animal-shark", "gobkit-pet-animalb-bee", "gobkit-pet-animalb-blue",
  "gobkit-pet-animalb-boar", "gobkit-pet-animalb-fugu", "gobkit-pet-animalb-goat", "gobkit-pet-animalb-marmot",
  "gobkit-pet-animalb-owl", "gobkit-pet-animalb-rat", "gobkit-pet-animalb-seal", "gobkit-pet-animalb-whale",
  "gobkit-pet-dino-ankylosaurus", "gobkit-pet-dino-carnotaurus", "gobkit-pet-dino-oviraptor", "gobkit-pet-dino-pachycephalosaurus",
  "gobkit-pet-dino-plesiosaurus", "gobkit-pet-dino-pterodactylus", "gobkit-pet-dino-spinosaurus", "gobkit-pet-dino-stegosaurus",
  "gobkit-pet-dino-trex", "gobkit-pet-dino-triceratops", "gobkit-pet-bird-eagle", "gobkit-pet-bird-flamingo",
  "gobkit-pet-bird-hummingbird", "gobkit-pet-bird-kiwi", "gobkit-pet-bird-macaw", "gobkit-pet-bird-peacock",
  "gobkit-pet-bird-pelican", "gobkit-pet-bird-penguin", "gobkit-pet-bird-rooster", "gobkit-pet-bird-toucan",
  "gobkit-pet-farm-blacksheep", "gobkit-pet-farm-bull", "gobkit-pet-farm-calf", "gobkit-pet-farm-highlandcow",
  "gobkit-pet-farm-holsteincow", "gobkit-pet-farm-lamb", "gobkit-pet-farm-pig", "gobkit-pet-farm-piglet",
  "gobkit-pet-farm-sheep", "gobkit-pet-farm-spottedpig", "gobkit-pet-animal006-bluetang", "gobkit-pet-animal006-doe",
  "gobkit-pet-animal006-elephant", "gobkit-pet-animal006-fox", "gobkit-pet-animal006-goose", "gobkit-pet-animal006-hare",
  "gobkit-pet-animal006-hedgehog", "gobkit-pet-animal006-lion", "gobkit-pet-animal006-squirrel", "gobkit-pet-animal006-zebra",
] as const;

export const KENNEY_BLASTER_IDS = [
  "blaster-a", "blaster-b", "blaster-c", "blaster-d", "blaster-e", "blaster-f",
  "blaster-g", "blaster-h", "blaster-i", "blaster-j", "blaster-k", "blaster-l",
  "blaster-m", "blaster-n", "blaster-o", "blaster-p", "blaster-q", "blaster-r",
] as const;
export type KenneyBlasterId = (typeof KENNEY_BLASTER_IDS)[number];
export type KenneyPetId = typeof KENNEY_PET_IDS[number];

export const KENNEY_VEHICLE_IDS = [
  "vehicle-speedster", "vehicle-racer", "vehicle-suv", "vehicle-monster-truck", "vehicle-truck",
  "car-sedan", "car-hatchback-sports", "car-taxi", "car-kart-oopi",
] as const;
export type KenneyVehicleId = typeof KENNEY_VEHICLE_IDS[number];

/** Parked vehicles on the shared campus, using centered world coordinates. */
export const INTERACTABLE_VEHICLE_PROPS = [
  { id: "campus-car-speedster", vehicleId: "vehicle-speedster", x: -4.5, z: -4.5, rotation: 0 },
  { id: "campus-car-racer", vehicleId: "vehicle-racer", x: 4.5, z: -4.5, rotation: 0 },
  { id: "campus-car-suv", vehicleId: "vehicle-suv", x: -4.5, z: 4.5, rotation: Math.PI },
  { id: "campus-car-taxi", vehicleId: "car-taxi", x: 4.5, z: 4.5, rotation: Math.PI },
  { id: "campus-car-monster-truck", vehicleId: "vehicle-monster-truck", x: -10, z: -10, rotation: 0 },
  { id: "campus-car-truck", vehicleId: "vehicle-truck", x: 0, z: -10, rotation: 0 },
  { id: "campus-car-sedan", vehicleId: "car-sedan", x: 10, z: -10, rotation: 0 },
  { id: "campus-car-sports-hatchback", vehicleId: "car-hatchback-sports", x: -10, z: 0, rotation: Math.PI },
  { id: "campus-car-kart", vehicleId: "car-kart-oopi", x: 10, z: 0, rotation: Math.PI },
] as const satisfies ReadonlyArray<{ id: string; vehicleId: KenneyVehicleId; x: number; z: number; rotation: number }>;

export const WORLD = {
  width: 24,
  depth: 18,
  playerRadius: 0.38,
  movementSpeed: 4.2,
  proximityRadius: 20,
  voiceFullVolumeRadius: 10,
  meetingZone: { id: "main", x: 0, z: 0, radius: 2.15, exitRadius: 2.45 },
  spawnPoints: [
    { x: -3.2, z: 0 },
    { x: 3.2, z: 0 },
    { x: 0, z: 3.2 },
    { x: 0, z: -3.2 },
  ],
  walls: [
    { x: -4.5, z: 1.2, width: 0.3, depth: 8.4 },
    { x: 4.5, z: -1.2, width: 0.3, depth: 8.4 },
    { x: 0, z: -4.2, width: 9.3, depth: 0.3 },
    { x: -2.725, z: 4.2, width: 3.85, depth: 0.3 },
    { x: 2.725, z: 4.2, width: 3.85, depth: 0.3 },
    { x: -8.2, z: -1.5, width: 2.2, depth: 0.25 },
    { x: 8.2, z: 1.5, width: 2.2, depth: 0.25 },
  ],
  obstacles: [
    { x: -8, z: -5, width: 1.7, depth: 0.9 },
    { x: -5.6, z: -5, width: 1.7, depth: 0.9 },
    { x: 5.6, z: 5, width: 1.7, depth: 0.9 },
    { x: 8, z: 5, width: 1.7, depth: 0.9 },
    { x: -8, z: 5, width: 1.7, depth: 0.9 },
    { x: 8, z: -5, width: 1.7, depth: 0.9 },
  ],
} as const;

export type WorldConfig = {
  width: number;
  depth: number;
  playerRadius: number;
  movementSpeed: number;
  proximityRadius: number;
  voiceFullVolumeRadius: number;
  meetingZone: { id: string; x: number; z: number; radius: number; exitRadius: number };
  spawnPoints: readonly Position[];
  walls: readonly Blocker[];
  obstacles: readonly Blocker[];
  collisionGrid?: BlockerGrid;
};

const CAMPUS_FLOOR = CAMPUS_LAYOUT.floors[0]!;
const centered = (x: number, z: number) => ({ x: x - CAMPUS_FLOOR.width / 2, z: z - CAMPUS_FLOOR.depth / 2 });
const roomWalls: Blocker[] = CAMPUS_LAYOUT.rooms.flatMap((room) => {
  const halfWidth = room.width / 2;
  const halfDepth = room.depth / 2;
  const thickness = 0.18;
  const doorWidth = Math.min(1.6, room.width * 0.3);
  const frontSegment = Math.max(0, (room.width - doorWidth) / 2);
  const at = (x: number, z: number, width: number, depth: number): Blocker => ({ ...centered(x, z), width, depth });
  return [
    at(room.x, room.z - halfDepth, room.width, thickness),
    at(room.x - halfWidth, room.z, thickness, room.depth),
    at(room.x + halfWidth, room.z, thickness, room.depth),
    ...(frontSegment > 0.15 ? [
      at(room.x - (doorWidth + frontSegment) / 2, room.z + halfDepth, frontSegment, thickness),
      at(room.x + (doorWidth + frontSegment) / 2, room.z + halfDepth, frontSegment, thickness),
    ] : []),
  ];
});
const outerWalls: Blocker[] = roomBoundaryWalls(CAMPUS_FLOOR.width, CAMPUS_FLOOR.depth);
const campusFurnitureBlockers: Blocker[] = [];
for (const room of CAMPUS_LAYOUT.rooms) {
  if (room.kind === "townhall") {
    campusFurnitureBlockers.push({ ...centered(room.x, room.z - room.depth * 0.32), width: room.width * 0.58, depth: 2.4 });
    for (let row = 0; row < 10; row += 1) {
      for (let column = 0; column < 15; column += 1) {
        campusFurnitureBlockers.push({ ...centered(room.x - 7.7 + column * 1.1, room.z - 3 + row * 1.12), width: 0.4, depth: 0.4 });
      }
    }
  } else if (["private-office", "daily-meeting", "cafeteria", "restroom"].includes(room.kind)) {
    for (const prop of campusPropPlacements(room)) {
      if (!prop.collision) continue;
      campusFurnitureBlockers.push({
        ...centered(room.x + prop.x, room.z + prop.z),
        width: prop.collisionWidth,
        depth: prop.collisionDepth,
      });
    }
  } else if (room.kind === "gym") {
    for (let index = 0; index < 3; index += 1) {
      campusFurnitureBlockers.push({ ...centered(room.x - 4.2 + index * 4.2, room.z + 2.3), width: 2.1, depth: 1.2 });
      campusFurnitureBlockers.push({ ...centered(room.x - 3.8 + index * 3.8, room.z - 2.2), width: 1.35, depth: 0.7 });
    }
  }
}
const campusSpawn = { x: 0, z: 0 };
// Keep the meeting audio area away from the central spawn so a newly joined
// player starts in the public shared space.
const campusMeeting = { x: -82, z: -104 };

/** Server-authoritative movement rules for the one-level Campus map (coordinates centered at 0,0). */
export const CAMPUS_WORLD = {
  width: CAMPUS_FLOOR.width,
  depth: CAMPUS_FLOOR.depth,
  playerRadius: 0.38,
  movementSpeed: 4.2,
  proximityRadius: 7,
  voiceFullVolumeRadius: 3,
  meetingZone: { id: "townhall", ...campusMeeting, radius: 8, exitRadius: 8.6 },
  spawnPoints: [
    campusSpawn,
    { x: -3, z: 0 },
    { x: 3, z: 0 },
    { x: 0, z: -3 },
    { x: 0, z: 3 },
  ],
  walls: [...outerWalls, ...roomWalls],
  obstacles: campusFurnitureBlockers,
  collisionGrid: makeBlockerGrid([...outerWalls, ...roomWalls, ...campusFurnitureBlockers]),
} satisfies WorldConfig;

/** Builds per-room blockers from the same saved prop layout rendered by the client. */
export function roomWorldFromConfig(config: unknown): WorldConfig {
  if (typeof config !== "object" || config === null || !("layout" in config)) return WORLD;
  const layout = readRoomLayout(config);
  const placedProps: Blocker[] = layout.props.filter((prop) => prop.collision && !prop.elevation).map((prop) => {
    const footprint = roomPropCollisionFootprint(prop);
    const playerClearanceRadius = roomPropCollisionClearanceRadius(prop);
    return {
      x: prop.x,
      z: prop.z,
      width: footprint.width,
      depth: footprint.depth,
      ...(playerClearanceRadius !== WORLD.playerRadius ? { playerClearanceRadius } : {}),
    };
  });
  const obstacles = placedProps;
  return { ...WORLD, obstacles, collisionGrid: makeBlockerGrid([...WORLD.walls, ...obstacles]) };
}

/** The office map's saved props use the same Campus coordinates as players and rendering. */
export function campusWorldFromConfig(
  config: unknown,
  excludedPropIds: ReadonlySet<string> = new Set(),
  propPositionOverrides: ReadonlyMap<string, { x: number; z: number; rotation?: number }> = new Map(),
): WorldConfig {
  const layout = readRoomLayout(config);
  const props = propPositionOverrides.size
    ? layout.props.map((prop) => {
      const position = propPositionOverrides.get(prop.id);
      return position ? { ...prop, ...position } : prop;
    })
    : layout.props;
  const width = layout.dimensions?.width ?? CAMPUS_WORLD.width;
  const depth = layout.dimensions?.depth ?? CAMPUS_WORLD.depth;
  const spawnPoints = layout.spawnPoint
    ? [
        layout.spawnPoint,
        ...Array.from({ length: 21 * 21 }, (_, index) => ({ dx: index % 21 - 10, dz: Math.floor(index / 21) - 10 }))
          .filter(({ dx, dz }) => dx !== 0 || dz !== 0)
          .sort((first, second) => Math.hypot(first.dx, first.dz) - Math.hypot(second.dx, second.dz))
          .map(({ dx, dz }) => ({ x: layout.spawnPoint!.x + dx * 1.1, z: layout.spawnPoint!.z + dz * 1.1 })),
        ...CAMPUS_WORLD.spawnPoints,
      ]
    : CAMPUS_WORLD.spawnPoints;
  // Wall-like assets stay solid in Ghost mode even when saved with a raised
  // placement height. Elevation must not silently turn structural geometry
  // into a pass-through prop.
  const wallProps = props.filter((prop) => !excludedPropIds.has(prop.id) && isRoomWallProp(prop));
  const wallPropIds = new Set(wallProps.map((prop) => prop.id));
  const placedProps: Blocker[] = props.filter((prop) => !excludedPropIds.has(prop.id) && !wallPropIds.has(prop.id) && prop.collision && !prop.elevation).map((prop) => {
    const footprint = roomPropCollisionFootprint(prop);
    const playerClearanceRadius = roomPropCollisionClearanceRadius(prop);
    return {
      x: prop.x,
      z: prop.z,
      width: footprint.width,
      depth: footprint.depth,
      ...(playerClearanceRadius !== CAMPUS_WORLD.playerRadius ? { playerClearanceRadius } : {}),
    };
  });
  const mapWalls: Blocker[] = layout.walls.flatMap((wall) => {
    const segments = roomWallSolidSegments(wall, layout.doors);
    return segments.map(({ start, end }) => wall.axis === "horizontal"
      ? { x: wall.x + (start + end) / 2, z: wall.z, width: end - start, depth: wall.thickness }
      : { x: wall.x, z: wall.z + (start + end) / 2, width: wall.thickness, depth: end - start });
  });
  const placedWallProps: Blocker[] = wallProps.map((prop) => {
    const footprint = roomPropCollisionFootprint(prop);
    return { x: prop.x, z: prop.z, width: footprint.width, depth: footprint.depth, playerClearanceRadius: CAMPUS_WORLD.playerRadius };
  });
  const boundaryWalls: Blocker[] = roomBoundaryWalls(width, depth);
  // An office's saved map is the source of truth for its furniture collision.
  // CAMPUS_WORLD.obstacles belong to the legacy built-in campus scene; carrying
  // those blockers into a custom office map creates invisible furniture around
  // (0, 0), which can block auto routes and chair approaches even though the
  // old scene objects are not rendered there.
  const obstacles = placedProps;
  const walls = [...boundaryWalls, ...mapWalls, ...placedWallProps];
  return { ...CAMPUS_WORLD, width, depth, spawnPoints, walls, obstacles, collisionGrid: makeBlockerGrid([...walls, ...obstacles]) };
}

export function roomLayoutZoneAt(position: Position, config: unknown, previousZoneId?: string | null) {
  return zoneAtWithExitMargin(position, readRoomLayout(config).zones, previousZoneId);
}

export const CAMERA = {
  offsetX: 8.5,
  offsetY: 10.5,
  offsetZ: 12.5,
  dragSensitivity: 0.006,
  zoomStep: 10,
  minZoom: 15,
  maxZoom: 35,
} as const;

export const DEFAULT_CAMERA_YAW = Math.atan2(CAMERA.offsetX, CAMERA.offsetZ);

export * from "./availability.js";

export type MediaActivity = { microphone: boolean; camera: boolean; screenShare: boolean };

export function isValidMediaActivity(value: unknown): value is MediaActivity {
  if (typeof value !== "object" || value === null) return false;
  const activity = value as Record<string, unknown>;
  return typeof activity.microphone === "boolean" && typeof activity.camera === "boolean" && typeof activity.screenShare === "boolean";
}

export const PlayerState = schema(
  {
    x: t.float32(),
    z: t.float32(),
    rotation: t.float32(),
    worldVersion: t.uint8(),
    displayName: t.string(),
    username: t.string(),
    characterId: t.string(),
    petId: t.string(),
    vehicleId: t.string(),
    vehicleMode: t.string(),
    vehiclePropId: t.string(),
    vehiclePropX: t.float32(),
    vehiclePropZ: t.float32(),
    vehiclePropRotation: t.float32(),
    sittingPropId: t.string(),
    dancing: t.boolean(),
    handRaised: t.boolean(),
    weaponId: t.string(),
    status: t.string(),
    presence: t.string(),
    microphoneEnabled: t.boolean(),
    cameraEnabled: t.boolean(),
    screenShareEnabled: t.boolean(),
    // Append schema fields so existing field indexes remain stable.
    isMaintainer: t.boolean().default(false),
    customStatusText: t.string(),
    customStatusEmoji: t.string(),
    customStatusExpiresAtMs: t.float64(),
  },
  "PlayerState",
);

export const OfficeState = schema(
  {
    players: t.map(PlayerState),
    spotlightUsernames: t.map("boolean"),
    spotlightEpoch: t.string(),
  },
  "OfficeState",
);

export type PlayerState = InstanceType<typeof PlayerState>;
export type OfficeState = InstanceType<typeof OfficeState>;

/** Converts screen-relative input (right and forward) into world-relative movement. */
export function screenMovementToWorld(input: MovementInput, cameraYaw: number): MovementInput {
  if (!Number.isFinite(input.x) || !Number.isFinite(input.z) || !Number.isFinite(cameraYaw)) {
    return { x: 0, z: 0 };
  }

  const length = Math.hypot(input.x, input.z);
  if (length === 0) return { x: 0, z: 0 };
  const scale = Math.min(length, 1) / length;
  const right = input.x * scale;
  const forward = input.z * scale;
  const cosYaw = Math.cos(cameraYaw);
  const sinYaw = Math.sin(cameraYaw);
  return {
    x: right * cosYaw - forward * sinYaw,
    z: -right * sinYaw - forward * cosYaw,
  };
}

export interface Position {
  x: number;
  z: number;
}

interface Blocker {
  x: number;
  z: number;
  width: number;
  depth: number;
  playerClearanceRadius?: number;
}

interface BlockerGrid {
  cellSize: number;
  cells: ReadonlyMap<string, readonly Blocker[]>;
}

export function makeBlockerGrid(blockers: readonly Blocker[], cellSize = 8): BlockerGrid {
  const cells = new Map<string, Blocker[]>();
  for (const blocker of blockers) {
    const minX = Math.floor((blocker.x - blocker.width / 2) / cellSize);
    const maxX = Math.floor((blocker.x + blocker.width / 2) / cellSize);
    const minZ = Math.floor((blocker.z - blocker.depth / 2) / cellSize);
    const maxZ = Math.floor((blocker.z + blocker.depth / 2) / cellSize);
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        const key = `${cellX},${cellZ}`;
        const bucket = cells.get(key) ?? [];
        bucket.push(blocker);
        cells.set(key, bucket);
      }
    }
  }
  return { cellSize, cells };
}

function blockersNear(position: Position, world: WorldConfig): readonly Blocker[] {
  if (!world.collisionGrid) return [...world.walls, ...world.obstacles];
  const { cellSize, cells } = world.collisionGrid;
  const radius = world.playerRadius;
  const minX = Math.floor((position.x - radius) / cellSize);
  const maxX = Math.floor((position.x + radius) / cellSize);
  const minZ = Math.floor((position.z - radius) / cellSize);
  const maxZ = Math.floor((position.z + radius) / cellSize);
  const seen = new Set<Blocker>();
  for (let cellX = minX; cellX <= maxX; cellX += 1) {
    for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
      for (const blocker of cells.get(`${cellX},${cellZ}`) ?? []) seen.add(blocker);
    }
  }
  return [...seen];
}

function overlapsBlocker(x: number, z: number, wall: Blocker, radius: number): boolean {
  radius = wall.playerClearanceRadius ?? radius;
  const halfWidth = wall.width / 2;
  const halfDepth = wall.depth / 2;
  const closestX = Math.max(wall.x - halfWidth, Math.min(x, wall.x + halfWidth));
  const closestZ = Math.max(wall.z - halfDepth, Math.min(z, wall.z + halfDepth));
  const dx = x - closestX;
  const dz = z - closestZ;
  return dx * dx + dz * dz < radius * radius;
}

export function isPositionWalkable(position: Position, world: WorldConfig = WORLD): boolean {
  const limitX = world.width / 2 - world.playerRadius;
  const limitZ = world.depth / 2 - world.playerRadius;
  const blockers = blockersNear(position, world);
  return (
    Math.abs(position.x) <= limitX &&
    Math.abs(position.z) <= limitZ &&
    blockers.every((wall) => !overlapsBlocker(position.x, position.z, wall, world.playerRadius))
  );
}

/** Checks that generated zone entrances have a walkable approach on the outside of the room. */
export function roomZoneEntranceIssues(layout: RoomLayout, zoneIds?: ReadonlySet<string>) {
  const world = campusWorldFromConfig({ version: 1, layout });
  const issues: Array<{ zoneId: string; doorId: string }> = [];
  for (const zone of layout.zones) {
    if (zoneIds && !zoneIds.has(zone.id)) continue;
    for (const door of layout.doors.filter((entry) => entry.id.startsWith(`${zone.id}-entrance-`))) {
      const wall = layout.walls.find((entry) => entry.id === door.wallId);
      if (!wall) { issues.push({ zoneId: zone.id, doorId: door.id }); continue; }
      const horizontal = wall.axis === "horizontal";
      const outwardSign = Math.sign(horizontal ? wall.z - zone.z : wall.x - zone.x);
      if (!outwardSign) { issues.push({ zoneId: zone.id, doorId: door.id }); continue; }
      const center = horizontal
        ? { x: wall.x + door.offset, z: wall.z }
        : { x: wall.x, z: wall.z + door.offset };
      const lateralRoom = Math.max(0, door.width / 2 - world.playerRadius - 0.03);
      const lateralOffsets = lateralRoom < 0.08 ? [0] : [0, -Math.min(0.16, lateralRoom), Math.min(0.16, lateralRoom)];
      const approachDistances = [wall.thickness / 2 + world.playerRadius + 0.12, wall.thickness / 2 + world.playerRadius + 0.85, wall.thickness / 2 + world.playerRadius + 1.6];
      const accessible = approachDistances.every((distance) => lateralOffsets.every((offset) => isPositionWalkable({
        x: center.x + (horizontal ? offset : outwardSign * distance),
        z: center.z + (horizontal ? outwardSign * distance : offset),
      }, world)));
      if (!accessible) issues.push({ zoneId: zone.id, doorId: door.id });
    }
  }
  return issues;
}

export function isInsideMeetingZone(position: Position, wasInside = false, world: WorldConfig = WORLD): boolean {
  const radius = wasInside ? world.meetingZone.exitRadius : world.meetingZone.radius;
  return Math.hypot(position.x - world.meetingZone.x, position.z - world.meetingZone.z) <= radius;
}

export function arePlayersNearby(first: Position, second: Position): boolean {
  return Math.hypot(first.x - second.x, first.z - second.z) <= WORLD.proximityRadius;
}

export function movePlayer(
  position: Position,
  input: MovementInput,
  deltaSeconds: number,
  world: WorldConfig = WORLD,
): Position {
  const inputLength = Math.hypot(input.x, input.z);
  if (!Number.isFinite(inputLength) || inputLength === 0) return { ...position };

  const scale = Math.min(inputLength, 1);
  const dx = (input.x / inputLength) * scale * world.movementSpeed * deltaSeconds;
  const dz = (input.z / inputLength) * scale * world.movementSpeed * deltaSeconds;
  const limitX = world.width / 2 - world.playerRadius;
  const limitZ = world.depth / 2 - world.playerRadius;

  // Subdivide large time steps so collision checks cannot skip over a thin wall.
  const distance = Math.hypot(dx, dz);
  const maxStep = world.playerRadius / 2;
  const steps = Math.max(1, Math.ceil(distance / maxStep));
  const stepX = dx / steps;
  const stepZ = dz / steps;
  let x = position.x;
  let z = position.z;

  for (let step = 0; step < steps; step += 1) {
    const nextX = Math.max(-limitX, Math.min(limitX, x + stepX));
    if (isPositionWalkable({ x: nextX, z }, world)) x = nextX;

    const nextZ = Math.max(-limitZ, Math.min(limitZ, z + stepZ));
    if (isPositionWalkable({ x, z: nextZ }, world)) z = nextZ;
  }

  return { x, z };
}

export function isValidMovementInput(value: unknown): value is MovementInput {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.x === "number" &&
    Number.isFinite(input.x) &&
    typeof input.z === "number" &&
    Number.isFinite(input.z) &&
    Math.abs(input.x) <= 1 &&
    Math.abs(input.z) <= 1 &&
    (input.sprint === undefined || typeof input.sprint === "boolean") &&
    (input.facingYaw === undefined || (typeof input.facingYaw === "number" && Number.isFinite(input.facingYaw)))
  );
}

export { normalizeAccountUsername } from "./accountUsername.js";

export * from "./desks.js";

export * from "./meetingHands.js";

export * from "./deskAssignmentFences.js";
