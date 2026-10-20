import type { RoomLayoutZone } from "./roomLayout.js";
import { campusTeamMeetingPlacements } from "./campusTeamMeetingTemplate.js";
import { campusPrivateRoomPlacements } from "./campusPrivateRoomTemplate.js";
import { campusCivicMeetingPlacements, campusLobbyPlacements, campusTownhallPlacements } from "./campusCivicRoomTemplates.js";
export { campusRestroomFixtures } from "./campusRestroomFixtures.js";

export type StarterPlacement = { key: string; asset: string; xM: number; zM: number; rotationRad?: number; supported?: boolean; collision?: boolean; elevationM?: number };
const ASSETS = {
  chair: "kit:chair", plant: "kit:pottedplant", table: "table",
} as const;
const HALF_TURN_RAD = Math.PI;
const ROOM_EDGE_INSET_M = 3;
const GROUP_X_OFFSETS_M = [-5, 5];
const TABLE_SEAT_X_OFFSETS_M = [-0.8, 0.8];
const TABLE_SEAT_Z_OFFSETS_M = [-1.8, 1.8];
const TABLE_ROW_Z_OFFSETS_M = [-6, 6];
const MEETING_TABLE_Z_M = -2;
// A meeting room only fits a second table group once it is this wide.
const MEETING_TWO_GROUP_MIN_WIDTH_M = 18;
const MEETING_GROUP_MAX_OFFSET_M = 5;
function plants(zone: RoomLayoutZone): StarterPlacement[] {
  const xM = Math.min(GROUP_X_OFFSETS_M[1]!, zone.width / 2 - ROOM_EDGE_INSET_M);
  return [-xM, xM].map((offset, index) => ({ key: `plant-${index}`, asset: ASSETS.plant, xM: offset, zM: zone.depth / 2 - ROOM_EDGE_INSET_M }));
}

/**
 * Meeting rooms are sized for the group that uses them, so the table layout
 * follows the room instead of assuming one large hall.
 */
function meetingRoom(zone: RoomLayoutZone): StarterPlacement[] {
  if (zone.width >= 40 && zone.depth >= 20 && /^meeting-(north|south)-/.test(zone.id)) return campusTeamMeetingPlacements(zone);
  const offsets = zone.width >= MEETING_TWO_GROUP_MIN_WIDTH_M
    ? [-1, 1].map((side) => side * Math.min(MEETING_GROUP_MAX_OFFSET_M, zone.width / 4))
    : [0];
  return [
    ...offsets.flatMap((xM, index) => tableGroup(`meeting-${index}`, xM, MEETING_TABLE_Z_M)),
    ...plants(zone),
  ];
}

function tableGroup(key: string, xM: number, zM: number): StarterPlacement[] {
  return [
    { key: `${key}-table`, asset: ASSETS.table, xM, zM },
    ...TABLE_SEAT_Z_OFFSETS_M.flatMap((seatZ, row) => TABLE_SEAT_X_OFFSETS_M.map((seatX, column) => ({
      key: `${key}-chair-${row}-${column}`, asset: ASSETS.chair, xM: xM + seatX, zM: zM + seatZ,
      rotationRad: seatZ < 0 ? HALF_TURN_RAD : 0,
    }))),
  ];
}

function cafeteria(zone: RoomLayoutZone): StarterPlacement[] {
  return [...TABLE_ROW_Z_OFFSETS_M.flatMap((zM, row) => GROUP_X_OFFSETS_M.flatMap((xM, column) => tableGroup(`dining-${row}-${column}`, xM, zM))), ...plants(zone)];
}

export function campusStarterPlacements(zone: RoomLayoutZone): readonly StarterPlacement[] {
  if (zone.kind === "private") return campusPrivateRoomPlacements(zone);
  // Restroom fixtures are added directly by the campus map generator.
  if (zone.kind === "restroom") return [];
  if (zone.id === "shared-townhall") return campusTownhallPlacements(zone);
  if (/^meeting-(small|large)-/.test(zone.id)) return campusCivicMeetingPlacements();
  if (zone.id === "shared-cafeteria") return cafeteria(zone);
  if (zone.id === "shared-lobby" || zone.id === "shared-lounge") return campusLobbyPlacements(zone);
  return meetingRoom(zone);
}
