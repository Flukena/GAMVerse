import type { RoomLayoutZone } from "./roomLayout.js";

export type StarterPlacement = { key: string; asset: string; xM: number; zM: number; rotationRad?: number; supported?: boolean };
const ASSETS = {
  desk: "kit:desk", chair: "kit:chair", deskChair: "kit:chairdesk", monitor: "computerScreen",
  storage: "kit:bookcaseopenlow", plant: "kit:pottedplant", table: "table", sofa: "kit:loungesofa",
  toilet: "kit:toilet", sink: "kit:bathroomsink", stage: "office-townhall-stage", podium: "office-townhall-podium",
} as const;
const HALF_TURN_RAD = Math.PI;
const ROOM_EDGE_INSET_M = 3;
const GROUP_X_OFFSETS_M = [-5, 5];
const TABLE_SEAT_X_OFFSETS_M = [-0.8, 0.8];
const TABLE_SEAT_Z_OFFSETS_M = [-1.8, 1.8];
const TABLE_ROW_Z_OFFSETS_M = [-6, 6];
const MEETING_TABLE_Z_M = -2;
const TOWNHALL_SEAT_X_OFFSETS_M = [-5, -3, 3, 5];
const TOWNHALL_SEAT_Z_OFFSETS_M = [-10, -6, -2, 2];
const TOWNHALL_STAGE_INSET_M = 4;
const TOWNHALL_PODIUM_X_M = 4.5;
const LOUNGE_SOFA_Z_M = -3;
const LOUNGE_TABLE_Z_M = 0;
const RESTROOM_X_OFFSETS_M = [-4, 4];
const PRIVATE_PLACEMENTS: readonly StarterPlacement[] = [
  { key: "desk", asset: ASSETS.desk, xM: -1.9, zM: -1.6 },
  { key: "monitor", asset: ASSETS.monitor, xM: -1.9, zM: -1.6, supported: true },
  { key: "chair", asset: ASSETS.deskChair, xM: -1.9, zM: 0.2 },
  { key: "storage", asset: ASSETS.storage, xM: 2.5, zM: -2.5 },
  { key: "plant", asset: ASSETS.plant, xM: 2.5, zM: 2.5 },
];

function plants(zone: RoomLayoutZone): StarterPlacement[] {
  return GROUP_X_OFFSETS_M.map((xM, index) => ({ key: `plant-${index}`, asset: ASSETS.plant, xM, zM: zone.depth / 2 - ROOM_EDGE_INSET_M }));
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

function townHall(zone: RoomLayoutZone): StarterPlacement[] {
  const zM = -zone.depth / 2 + TOWNHALL_STAGE_INSET_M;
  return [
    { key: "stage", asset: ASSETS.stage, xM: 0, zM },
    { key: "podium", asset: ASSETS.podium, xM: TOWNHALL_PODIUM_X_M, zM },
    ...TOWNHALL_SEAT_Z_OFFSETS_M.flatMap((seatZ, row) => TOWNHALL_SEAT_X_OFFSETS_M.map((xM, column) => ({
      key: `audience-${row}-${column}`, asset: ASSETS.chair, xM, zM: seatZ,
    }))),
    ...plants(zone),
  ];
}

function cafeteria(zone: RoomLayoutZone): StarterPlacement[] {
  return [...TABLE_ROW_Z_OFFSETS_M.flatMap((zM, row) => GROUP_X_OFFSETS_M.flatMap((xM, column) => tableGroup(`dining-${row}-${column}`, xM, zM))), ...plants(zone)];
}

function lounge(zone: RoomLayoutZone): StarterPlacement[] {
  return [
    ...GROUP_X_OFFSETS_M.flatMap((xM, index) => [
      { key: `sofa-${index}`, asset: ASSETS.sofa, xM, zM: LOUNGE_SOFA_Z_M },
      { key: `table-${index}`, asset: ASSETS.table, xM, zM: LOUNGE_TABLE_Z_M },
    ]),
    ...plants(zone),
  ];
}

function restroom(zone: RoomLayoutZone): StarterPlacement[] {
  return RESTROOM_X_OFFSETS_M.flatMap((xM, index) => [
    { key: `toilet-${index}`, asset: ASSETS.toilet, xM, zM: -zone.depth / 2 + ROOM_EDGE_INSET_M },
    { key: `sink-${index}`, asset: ASSETS.sink, xM, zM: zone.depth / 2 - ROOM_EDGE_INSET_M, rotationRad: HALF_TURN_RAD },
  ]);
}

export function campusStarterPlacements(zone: RoomLayoutZone): readonly StarterPlacement[] {
  if (zone.kind === "private") return PRIVATE_PLACEMENTS;
  if (zone.kind === "restroom") return restroom(zone);
  if (zone.id === "shared-townhall") return townHall(zone);
  if (zone.id === "shared-cafeteria") return cafeteria(zone);
  if (zone.id === "shared-lounge" || zone.id === "shared-lobby") return lounge(zone);
  return [...GROUP_X_OFFSETS_M.flatMap((xM, index) => tableGroup(`meeting-${index}`, xM, MEETING_TABLE_Z_M)), ...plants(zone)];
}
