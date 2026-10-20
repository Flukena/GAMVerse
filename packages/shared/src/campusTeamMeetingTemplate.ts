import type { StarterPlacement } from "./campusFurnishingTemplates.js";
import type { RoomLayoutZone } from "./roomLayout.js";

export const TEAM_MEETING_PROP_BUDGET_COUNT = 160;
const HALF_TURN_RAD = Math.PI;
const QUARTER_TURN_RAD = Math.PI / 2;
const CARPET_TILE_SIZE_M = 2;
const TABLE_GROUP_X_M = 6.5;
const TABLE_SEGMENT_Z_M = [-3, 0, 3];
const CHAIR_Z_M = [-4, -2, 0, 2, 4];
const CHAIR_SIDE_X_M = 1.6;
const COMPACT_ROOM_WIDTH_M = 46;
const LOUNGE_WALL_INSET_M = 4.5;
const LOUNGE_SOFA_Z_M = 3;
const LOUNGE_SOFA_X_M = 1.6;
const WALL_FURNITURE_INSET_M = 1.2;
const ASSET = {
  carpet: "external-pixel-modern-office-pixel-modern-office-floor-tile-carpet-01352f6c",
  sofa: "external-cozy-home-interiors-cozy-home-interiors-sofa-three-seat-8d2d33f9",
  coffeeTable: "kit:tablecoffee",
  shelf: "external-pixel-modern-office-pixel-modern-office-bookshelf-binders-33ed7a74",
  lamp: "external-pixel-modern-office-pixel-modern-office-floor-lamp-34798ca7",
  coffee: "kit:kitchencoffeemachine",
  water: "external-pixel-modern-office-pixel-modern-office-water-cooler-33f143d4",
} as const;

/** Four rectangular floor finishes define furniture islands, leaving the entrance axis clear. */
function carpetIsland(key: string, xM: number, columns: number, rows: number): StarterPlacement[] {
  return Array.from({ length: columns * rows }, (_, index) => ({
    key: `carpet-${key}-${index}`, asset: ASSET.carpet,
    xM: xM + (index % columns - (columns - 1) / 2) * CARPET_TILE_SIZE_M,
    zM: (Math.floor(index / columns) - (rows - 1) / 2) * CARPET_TILE_SIZE_M,
  }));
}

/** Creation-only furnishing: two conference islands, paired lounges and a far-wall service wall. */
export function campusTeamMeetingPlacements(zone: RoomLayoutZone): StarterPlacement[] {
  const doorDirection = zone.id.includes("north") ? 1 : -1;
  const halfWidthM = zone.width / 2;
  const halfDepthM = zone.depth / 2;
  const compact = zone.width < COMPACT_ROOM_WIDTH_M;
  const placements: StarterPlacement[] = [];
  // Mirror the entire plan, including seating orientation, around the entrance side.
  const add = (key: string, asset: string, xM: number, zM: number, rotationRad = 0, supported = false) => {
    placements.push({ key, asset, xM, zM: zM * doorDirection, rotationRad: doorDirection > 0 ? rotationRad : HALF_TURN_RAD - rotationRad, ...(supported ? { supported } : {}) });
  };
  for (const side of [-1, 1]) {
    const tableX = side * TABLE_GROUP_X_M;
    placements.push(...carpetIsland(`conference-${side}`, tableX, 4, 6));
    for (const [index, tableZ] of TABLE_SEGMENT_Z_M.entries()) add(`conference-${side}-table-${index}`, "table", tableX, tableZ, QUARTER_TURN_RAD);
    for (const seatSide of [-1, 1]) for (const [index, seatZ] of CHAIR_Z_M.entries()) {
      // Seat forward is local -Z, so west-side chairs face east toward their table.
      add(`conference-${side}-chair-${seatSide}-${index}`, "kit:chair", tableX + seatSide * CHAIR_SIDE_X_M, seatZ, seatSide < 0 ? -QUARTER_TURN_RAD : QUARTER_TURN_RAD);
    }
    add(`conference-${side}-laptop`, "kit:laptop", tableX - 0.5, 0, 0, true);
    add(`conference-${side}-coffee`, "kit-food-kit-cup-coffee", tableX + 0.5, 0, 0, true);
    const loungeX = side * (halfWidthM - LOUNGE_WALL_INSET_M);
    placements.push(...carpetIsland(`lounge-${side}`, loungeX, compact ? 3 : 4, 4));
    // Facing sofa banks form a conversation area around shared coffee tables.
    for (const sofaSide of [-1, 1]) for (const [index, offsetX] of [-LOUNGE_SOFA_X_M, LOUNGE_SOFA_X_M].entries()) {
      add(`lounge-${side}-sofa-${sofaSide}-${index}`, ASSET.sofa, loungeX + offsetX, sofaSide * LOUNGE_SOFA_Z_M, sofaSide > 0 ? 0 : HALF_TURN_RAD);
    }
    for (const [index, offsetX] of [-LOUNGE_SOFA_X_M, LOUNGE_SOFA_X_M].entries()) add(`lounge-${side}-table-${index}`, ASSET.coffeeTable, loungeX + offsetX, 0);
    for (const end of [-1, 1]) {
      add(`lounge-${side}-plant-${end}`, "kit:pottedplant", loungeX, end * 4.8);
      add(`lounge-${side}-lamp-${end}`, ASSET.lamp, loungeX + side * 3.3, end * 4.8);
    }
    const serviceZ = -halfDepthM + WALL_FURNITURE_INSET_M;
    // Storage stays grouped behind each lounge, with all fronts facing the room.
    for (const [index, offsetX] of [-2.2, -1, 0.2].entries()) add(`library-${side}-${index}`, ASSET.shelf, loungeX + offsetX, serviceZ, HALF_TURN_RAD);
    add(`library-${side}-plant`, "kit:pottedplant", loungeX + 2, serviceZ);
  }
  add("presentation-screen", "kit:televisionmodern", 0, -halfDepthM + 0.6);
  add("presentation-podium", "office-townhall-podium", 2.5, -halfDepthM + 3);
  // A single refreshment wall flanks the entrance; machines stand beside the counter.
  const refreshmentZ = halfDepthM - WALL_FURNITURE_INSET_M;
  for (const [index, xM] of [-8.5, -7.3, -6.1].entries()) add(`refreshment-counter-${index}`, "kit:kitchencabinet", xM, refreshmentZ);
  add("refreshment-coffee-machine", ASSET.coffee, -10, refreshmentZ);
  add("refreshment-water-cooler", ASSET.water, -11.5, refreshmentZ);
  add("refreshment-fridge", "kit:kitchenfridge", -13, refreshmentZ);
  return placements;
}
