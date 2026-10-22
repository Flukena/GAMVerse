import type { RoomLayoutZone } from "./roomLayoutTypes.js";
import type { StarterPlacement } from "./campusFurnishingTypes.js";

const DESK_ASSET = "external-pixel-modern-office-pixel-modern-office-desk-l-shaped-e63b68bc";
const KEYBOARD_ASSET = "kit:computerkeyboard";
const MONITOR_ASSETS = [
  "computerScreen",
  "external-pixel-modern-office-pixel-modern-office-monitor-arm-54a8d67b",
  "external-cozy-home-interiors-cozy-home-interiors-computer-monitor-3e762133",
] as const;
const BED_ASSETS = ["kit:bedsingle", "kit:beddouble"] as const;
const PLANT_ASSETS = ["kit:pottedplant", "kit:plantsmall1", "kit:plantsmall2", "kit:plantsmall3"] as const;
const DECOR_ASSETS = ["kit:books", "kit:radio"] as const;
const QUARTER_TURN_RAD = Math.PI / 2;
const DESK_X_M = -2;
const DESK_Z_M = -2.2;
const DESKTOP_ROW_OFFSET_M = 0.5;
const KITCHEN_X_M = 3.2;
const KITCHEN_START_Z_M = 0.1;
const KITCHEN_SPACING_M = 1.1;
const KITCHEN_ASSETS = ["kit:kitchenfridge", "kit:kitchensink", "kit:kitchencabinet", "kit:kitchenstove"] as const;

function identityHash(identity: string): number {
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Fixed 8 × 8 m studio: the central north/south entrance aisle stays empty. */
export function campusPrivateRoomPlacements(zone: RoomLayoutZone): readonly StarterPlacement[] {
  const variant = (key: string) => identityHash(`${zone.id}:${key}`);
  return [
    { key: "desk", asset: DESK_ASSET, xM: DESK_X_M, zM: DESK_Z_M },
    { key: "monitor", asset: MONITOR_ASSETS[variant("computer") % MONITOR_ASSETS.length]!, xM: DESK_X_M, zM: DESK_Z_M - DESKTOP_ROW_OFFSET_M, supported: true },
    { key: "keyboard", asset: KEYBOARD_ASSET, xM: DESK_X_M, zM: DESK_Z_M + DESKTOP_ROW_OFFSET_M, supported: true },
    { key: "chair", asset: "kit:chairdesk", xM: DESK_X_M, zM: 0.1 },
    { key: "bed", asset: BED_ASSETS[variant("bed") % BED_ASSETS.length]!, xM: 2, zM: -2.2 },
    ...KITCHEN_ASSETS.map((asset, index) => ({
      key: ["fridge", "sink", "counter", "stove"][index]!, asset,
      xM: KITCHEN_X_M, zM: KITCHEN_START_Z_M + index * KITCHEN_SPACING_M,
      rotationRad: QUARTER_TURN_RAD,
    })),
    { key: "washer", asset: "kit:washer", xM: -3.2, zM: 3.2 },
    { key: "storage", asset: "kit:bookcaseopenlow", xM: -2, zM: 3.2 },
    { key: "decor", asset: DECOR_ASSETS[variant("decor") % DECOR_ASSETS.length]!, xM: -2, zM: 3.2, supported: true },
    { key: "plant", asset: PLANT_ASSETS[variant("plant") % PLANT_ASSETS.length]!, xM: -3.2, zM: 1.6 },
  ];
}
