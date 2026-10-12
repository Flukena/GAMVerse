/**
 * Single-level campus plan for 150 staff. Coordinates are measured in meters.
 * The current server has no floor state or vertical collision, so all rooms
 * share one walkable-design level instead of pretending stairs change floors.
 */
export type CampusRoomKind =
  | "private-office"
  | "daily-meeting"
  | "townhall"
  | "cafeteria"
  | "restroom"
  | "gym"
  | "lobby"
  | "corridor";

export interface CampusRoom {
  id: string;
  name: string;
  kind: CampusRoomKind;
  floor: number;
  team?: number;
  capacity?: number;
  x: number;
  z: number;
  width: number;
  depth: number;
  furniture: string[];
}

/** Footprint in meters for one solid prop in a room's local X/Z plane. */
export interface CampusPropPlacement {
  asset: string;
  height: number;
  x: number;
  y: number;
  z: number;
  collisionWidth: number;
  collisionDepth: number;
  collision: boolean;
}

// Keep one clean, shared floor until the space layout is ready to be rebuilt.
const rooms: CampusRoom[] = [];

export const CAMPUS_LAYOUT = {
  gridUnit: "meter",
  floors: [
    { id: 0, name: "One-level Campus", width: 200, depth: 250 },
  ],
  teamCount: 10,
  peoplePerTeam: 15,
  totalPeople: 150,
  restroomZones: 4,
  singleUserRestroomsPerZone: 4,
  rooms,
} as const satisfies {
  gridUnit: string;
  floors: { id: number; name: string; width: number; depth: number }[];
  teamCount: number;
  peoplePerTeam: number;
  totalPeople: number;
  restroomZones: number;
  singleUserRestroomsPerZone: number;
  rooms: CampusRoom[];
};

/** Shared prop placements keep visible models and server-side blockers aligned. */
export function campusPropPlacements(room: CampusRoom): CampusPropPlacement[] {
  if (room.kind === "private-office") return [
    { asset: "desk", height: 0.74, x: 0, y: 0, z: -0.55, collisionWidth: 1.414, collisionDepth: 0.755, collision: true },
    { asset: "chairDesk", height: 0.72, x: 0, y: 0, z: 0.45, collisionWidth: 0.397, collisionDepth: 0.372, collision: true },
    { asset: "computerScreen", height: 0.5, x: 0, y: 0.74, z: -0.55, collisionWidth: 0.667, collisionDepth: 0.177, collision: false },
  ];
  if (room.kind === "daily-meeting") return [
    { asset: "table", height: 1.05, x: 0, y: 0, z: 0, collisionWidth: 2.704, collisionDepth: 1.438, collision: true },
    ...Array.from({ length: 7 }, (_, index) => ({ asset: "chair", height: 0.8, x: -3.2 + index * 1.07, y: 0, z: -1.45, collisionWidth: 0.34, collisionDepth: 0.34, collision: true })),
    ...Array.from({ length: 6 }, (_, index) => ({ asset: "chair", height: 0.8, x: -2.675 + index * 1.07, y: 0, z: 1.45, collisionWidth: 0.34, collisionDepth: 0.34, collision: true })),
    { asset: "chair", height: 0.8, x: -3.4, y: 0, z: 0, collisionWidth: 0.34, collisionDepth: 0.34, collision: true },
    { asset: "chair", height: 0.8, x: 3.4, y: 0, z: 0, collisionWidth: 0.34, collisionDepth: 0.34, collision: true },
  ];
  if (room.kind === "cafeteria") return Array.from({ length: 20 }, (_, index) => {
    const row = Math.floor(index / 5);
    const column = index % 5;
    const x = -6 + column * 2.9;
    const z = -4.2 + row * 2.7;
    return [
      { asset: "table", height: 0.9, x, y: 0, z, collisionWidth: 2.318, collisionDepth: 1.232, collision: true },
      { asset: "chair", height: 0.78, x: x - 0.9, y: 0, z, collisionWidth: 0.332, collisionDepth: 0.332, collision: true },
      { asset: "chair", height: 0.78, x: x + 0.9, y: 0, z, collisionWidth: 0.332, collisionDepth: 0.332, collision: true },
    ];
  }).flat();
  if (room.kind === "restroom") return [
    ...Array.from({ length: 4 }, (_, index) => ({ asset: "toilet", height: 0.62, x: -2.4 + index * 1.6, y: 0, z: 0.3, collisionWidth: 0.43, collisionDepth: 0.656, collision: true })),
    { asset: "bathroomSink", height: 0.88, x: 0, y: 0, z: -1.7, collisionWidth: 0.534, collisionDepth: 0.456, collision: true },
  ];
  return [];
}

/** Maps the legacy room editor's [-12..12] × [-9..9] portal grid onto the central lobby. */
export function legacyPortalToCampus(position: { x: number; z: number; radius: number }) {
  const floor = CAMPUS_LAYOUT.floors[0]!;
  return {
    x: position.x * 0.5,
    z: position.z * (10 / 18),
    radius: Math.max(0.55, position.radius * 0.5),
  };
}

export const CAMPUS_COUNTS = {
  privateOffices: CAMPUS_LAYOUT.rooms.filter((room) => room.kind === "private-office").length,
  dailyMeetingRooms: CAMPUS_LAYOUT.rooms.filter((room) => room.kind === "daily-meeting").length,
  townhalls: CAMPUS_LAYOUT.rooms.filter((room) => room.kind === "townhall").length,
  cafeterias: CAMPUS_LAYOUT.rooms.filter((room) => room.kind === "cafeteria").length,
  restroomZones: CAMPUS_LAYOUT.rooms.filter((room) => room.kind === "restroom").length,
  gyms: CAMPUS_LAYOUT.rooms.filter((room) => room.kind === "gym").length,
};
