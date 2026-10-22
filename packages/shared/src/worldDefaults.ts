import { CAMPUS_LAYOUT, campusPropPlacements } from "./campusLayout.js";
import { roomBoundaryWalls } from "./roomWallSegments.js";
import { makeBlockerGrid } from "./blockerGrid.js";
import type { Blocker, WorldConfig } from "./worldTypes.js";

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

const CAMPUS_ROOM_WALL_THICKNESS_M = 0.18;
const CAMPUS_ROOM_MAX_DOOR_WIDTH_M = 1.6;
const CAMPUS_ROOM_DOOR_WIDTH_RATIO = 0.3;
const CAMPUS_ROOM_MIN_FRONT_WALL_LENGTH_M = 0.15;
const TOWNHALL_SEAT_ROW_COUNT = 10;
const TOWNHALL_SEAT_COLUMN_COUNT = 15;
const TOWNHALL_STAGE_Z_RATIO = 0.32;
const TOWNHALL_STAGE_WIDTH_RATIO = 0.58;
const TOWNHALL_STAGE_DEPTH_M = 2.4;
const TOWNHALL_SEAT_START_X_M = -7.7;
const TOWNHALL_SEAT_START_Z_M = -3;
const TOWNHALL_SEAT_SPACING_X_M = 1.1;
const TOWNHALL_SEAT_SPACING_Z_M = 1.12;
const TOWNHALL_SEAT_SIZE_M = 0.4;
const GYM_EQUIPMENT_PAIR_COUNT = 3;
const GYM_FRONT_EQUIPMENT_SPACING_X_M = 4.2;
const GYM_FRONT_EQUIPMENT_Z_M = 2.3;
const GYM_FRONT_EQUIPMENT_WIDTH_M = 2.1;
const GYM_FRONT_EQUIPMENT_DEPTH_M = 1.2;
const GYM_REAR_EQUIPMENT_SPACING_X_M = 3.8;
const GYM_REAR_EQUIPMENT_Z_M = -2.2;
const GYM_REAR_EQUIPMENT_WIDTH_M = 1.35;
const GYM_REAR_EQUIPMENT_DEPTH_M = 0.7;

const CAMPUS_FLOOR = CAMPUS_LAYOUT.floors[0]!;
const centered = (x: number, z: number) => ({ x: x - CAMPUS_FLOOR.width / 2, z: z - CAMPUS_FLOOR.depth / 2 });
const roomWalls: Blocker[] = CAMPUS_LAYOUT.rooms.flatMap((room) => {
  const halfWidth = room.width / 2;
  const halfDepth = room.depth / 2;
  const thickness = CAMPUS_ROOM_WALL_THICKNESS_M;
  const doorWidth = Math.min(CAMPUS_ROOM_MAX_DOOR_WIDTH_M, room.width * CAMPUS_ROOM_DOOR_WIDTH_RATIO);
  const frontSegment = Math.max(0, (room.width - doorWidth) / 2);
  const at = (x: number, z: number, width: number, depth: number): Blocker => ({ ...centered(x, z), width, depth });
  return [
    at(room.x, room.z - halfDepth, room.width, thickness),
    at(room.x - halfWidth, room.z, thickness, room.depth),
    at(room.x + halfWidth, room.z, thickness, room.depth),
    ...(frontSegment > CAMPUS_ROOM_MIN_FRONT_WALL_LENGTH_M ? [
      at(room.x - (doorWidth + frontSegment) / 2, room.z + halfDepth, frontSegment, thickness),
      at(room.x + (doorWidth + frontSegment) / 2, room.z + halfDepth, frontSegment, thickness),
    ] : []),
  ];
});
const outerWalls: Blocker[] = roomBoundaryWalls(CAMPUS_FLOOR.width, CAMPUS_FLOOR.depth);
const campusFurnitureBlockers: Blocker[] = [];
for (const room of CAMPUS_LAYOUT.rooms) {
  if (room.kind === "townhall") {
    campusFurnitureBlockers.push({ ...centered(room.x, room.z - room.depth * TOWNHALL_STAGE_Z_RATIO), width: room.width * TOWNHALL_STAGE_WIDTH_RATIO, depth: TOWNHALL_STAGE_DEPTH_M });
    for (let row = 0; row < TOWNHALL_SEAT_ROW_COUNT; row += 1) {
      for (let column = 0; column < TOWNHALL_SEAT_COLUMN_COUNT; column += 1) {
        campusFurnitureBlockers.push({ ...centered(room.x + TOWNHALL_SEAT_START_X_M + column * TOWNHALL_SEAT_SPACING_X_M, room.z + TOWNHALL_SEAT_START_Z_M + row * TOWNHALL_SEAT_SPACING_Z_M), width: TOWNHALL_SEAT_SIZE_M, depth: TOWNHALL_SEAT_SIZE_M });
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
    for (let index = 0; index < GYM_EQUIPMENT_PAIR_COUNT; index += 1) {
      campusFurnitureBlockers.push({ ...centered(room.x - GYM_FRONT_EQUIPMENT_SPACING_X_M + index * GYM_FRONT_EQUIPMENT_SPACING_X_M, room.z + GYM_FRONT_EQUIPMENT_Z_M), width: GYM_FRONT_EQUIPMENT_WIDTH_M, depth: GYM_FRONT_EQUIPMENT_DEPTH_M });
      campusFurnitureBlockers.push({ ...centered(room.x - GYM_REAR_EQUIPMENT_SPACING_X_M + index * GYM_REAR_EQUIPMENT_SPACING_X_M, room.z + GYM_REAR_EQUIPMENT_Z_M), width: GYM_REAR_EQUIPMENT_WIDTH_M, depth: GYM_REAR_EQUIPMENT_DEPTH_M });
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
