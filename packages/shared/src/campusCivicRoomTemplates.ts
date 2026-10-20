import type { RoomLayoutZone } from "./roomLayout.js";
import type { StarterPlacement } from "./campusFurnishingTemplates.js";

export const CIVIC_TOWNHALL_PROP_BUDGET_COUNT = 240;
const HALF_TURN_RAD = Math.PI;
const QUARTER_TURN_RAD = Math.PI / 2;
const MEETING_CHAIR_ROW_Z_M = [-3.8, -1.4, 1, 3.4, 5.8];
const MEETING_CHAIR_COLUMN_STEP_M = 1.15;
const MEETING_CENTER_AISLE_HALF_WIDTH_M = 1.8;
const TOWNHALL_CHAIR_ROW_Z_M = [-12, -9.4, -6.8, -4.2, -1.6, 2.6, 5.2, 7.8, 10.4, 13];
const TOWNHALL_CHAIR_COLUMN_STEP_M = 1.3;
const TOWNHALL_CENTER_AISLE_HALF_WIDTH_M = 2;
const MEETING_STAGE_Z_M = -6;
const TOWNHALL_STAGE_Z_M = -18;
const WALL_DECOR_INSET_M = 2;

/** Theatre seating with a clear central aisle and a transverse entrance aisle. */
function audience(rowsM: readonly number[], columnsPerBank: number, centerAisleHalfWidthM: number, columnStepM: number): StarterPlacement[] {
  return rowsM.flatMap((zM, row) => [-1, 1].flatMap(side => Array.from({ length: columnsPerBank }, (_, column) => ({
    key: `audience-${row}-${side}-${column}`, asset: "kit:chair", xM: side * (centerAisleHalfWidthM + column * columnStepM), zM,
  }))));
}

export function campusCivicMeetingPlacements(): StarterPlacement[] {
  return [
    ...audience(MEETING_CHAIR_ROW_Z_M, 5, MEETING_CENTER_AISLE_HALF_WIDTH_M, MEETING_CHAIR_COLUMN_STEP_M),
    { key: "presentation-stage", asset: "office-townhall-stage", xM: 0, zM: MEETING_STAGE_Z_M },
    { key: "presentation-screen", asset: "office-civic-screen", xM: 0, zM: -6.8 },
    { key: "presentation-podium", asset: "office-townhall-podium", xM: 4.5, zM: -6.4 },
    ...[-1, 1].map(side => ({ key: `presentation-plant-${side}`, asset: "kit:pottedplant", xM: side * 8.5, zM: -6.4 })),
    { key: "refreshment-coffee", asset: "kit:kitchencoffeemachine", xM: -8.5, zM: 6.5 },
    { key: "refreshment-bin", asset: "kit:trashcan", xM: 8.5, zM: 6.5 },
  ];
}

export function campusTownhallPlacements(zone: RoomLayoutZone): StarterPlacement[] {
  return [
    ...audience(TOWNHALL_CHAIR_ROW_Z_M, 10, TOWNHALL_CENTER_AISLE_HALF_WIDTH_M, TOWNHALL_CHAIR_COLUMN_STEP_M),
    ...[-6, 0, 6].map((xM, index) => ({ key: `presentation-stage-${index}`, asset: "office-townhall-stage", xM, zM: TOWNHALL_STAGE_Z_M })),
    { key: "presentation-screen", asset: "office-townhall-screen", xM: 0, zM: -20.5 },
    { key: "presentation-podium", asset: "office-townhall-podium", xM: 0, zM: -15.5 },
    ...[-1, 1].flatMap(side => [
      { key: `presentation-plant-${side}`, asset: "kit:pottedplant", xM: side * 18, zM: -18 },
      { key: `welcome-desk-${side}`, asset: "kit:desk", xM: side * 12, zM: 18 },
      { key: `welcome-chair-${side}`, asset: "kit:chairdesk", xM: side * 12, zM: 19.5 },
      { key: `entry-plant-${side}`, asset: "kit:pottedplant", xM: side * 18, zM: zone.depth / 2 - WALL_DECOR_INSET_M },
      { key: `entry-bin-${side}`, asset: "kit:trashcan", xM: side * 16, zM: zone.depth / 2 - WALL_DECOR_INSET_M },
    ]),
  ];
}

export function campusLobbyPlacements(zone: RoomLayoutZone): StarterPlacement[] {
  const deskX_M = -zone.width / 2 + 5;
  return [
    ...[-2, 2].flatMap((zM, index) => [
      { key: `reception-desk-${index}`, asset: "kit:desk", xM: deskX_M, zM, rotationRad: QUARTER_TURN_RAD },
      { key: `reception-chair-${index}`, asset: "kit:chairdesk", xM: deskX_M - 2.5, zM, rotationRad: -QUARTER_TURN_RAD },
      { key: `reception-laptop-${index}`, asset: "kit:laptop", xM: deskX_M, zM, rotationRad: QUARTER_TURN_RAD, supported: true },
    ]),
    ...[-1, 1].flatMap(side => [
      { key: `waiting-sofa-back-${side}`, asset: "kit:loungesofa", xM: 4, zM: side * 11, rotationRad: side < 0 ? HALF_TURN_RAD : 0 },
      { key: `waiting-sofa-front-${side}`, asset: "kit:loungesofa", xM: 4, zM: side * 6, rotationRad: side < 0 ? 0 : HALF_TURN_RAD },
      { key: `waiting-table-${side}`, asset: "kit:tablecoffee", xM: 4, zM: side * 8.5 },
      { key: `waiting-plant-${side}`, asset: "kit:pottedplant", xM: 8, zM: side * 11 },
      { key: `waiting-lamp-${side}`, asset: "external-pixel-modern-office-pixel-modern-office-floor-lamp-34798ca7", xM: 8, zM: side * 6 },
    ]),
    { key: "reception-library", asset: "external-pixel-modern-office-pixel-modern-office-bookshelf-binders-33ed7a74", xM: deskX_M - 1, zM: -12 },
    { key: "reception-coffee", asset: "kit:kitchencoffeemachine", xM: deskX_M + 2, zM: -12 },
    { key: "reception-bin", asset: "kit:trashcan", xM: deskX_M + 4, zM: -12 },
    { key: "reception-wayfinding", asset: "office-wayfinding-sign", xM: zone.width / 2 - 2, zM: 3 },
  ];
}
