import type { RoomPropDefinition, RoomPropEditorRole } from "./roomPropTypes.js";
import { roomPropBlockFootprint } from "./roomLayoutProps.js";

const MIN_ROOM_PROP_FOOTPRINT_M = 1;
const SMALL_PROP_MAX_HEIGHT_M = 0.3;
const SMALL_PROP_MAX_FOOTPRINT_M = 0.55;
const SEAT_COLLISION_SCALE_RATIO = 0.9;
const SEAT_COLLISION_CLEARANCE_RADIUS_M = 0.2;
const BUNK_BED_SEAT_HEIGHT_RATIO = 0.27;
const BED_SEAT_HEIGHT_RATIO = 0.69;
const BAR_STOOL_SEAT_HEIGHT_M = 0.62;
const SUSHI_STOOL_SEAT_HEIGHT_M = 0.32;
const DEFAULT_SEAT_HEIGHT_RATIO = 0.4;
const DEFAULT_SEAT_MIN_HEIGHT_M = 0.18;
const DEFAULT_SEAT_MAX_HEIGHT_M = 0.4;
const FLOOR_TILE_GROUP_LABEL = "Floor tiles";
const FURNITURE_SEAT_HEIGHT_RULES = [
  { asset: /kit:(chair|chaircushion|chairrounded|bench|benchcushion|benchcushionlow)$/, heightRatio: 0.15, maxHeightM: 0.16 },
  { asset: /kit:chairdesk$/, heightRatio: 0.34, maxHeightM: 0.32 },
  { asset: /kit:loungesofa|kit:loungechair$/, heightRatio: 0.5, maxHeightM: 0.45 },
  { asset: /kit:loungechairrelax$/, heightRatio: 0.23, maxHeightM: 0.22 },
] as const;

const FINISHED_BUILDING_PROP_ASSETS = new Set([
  ..."abcdefghijklmnopqrst".split("").map((suffix) => `kit-city-kit-industrial-building-${suffix}`),
  "external-cozy-home-interiors-cozy-home-interiors-home-connector-cases-1b43f818-starter-scene",
  "external-cozy-home-interiors-cozy-home-interiors-two-storey-cutaway-home-4a617fd1",
]);

const isShelfProp = (item: RoomPropDefinition) => !item.wallMounted && !item.group?.startsWith("Wall ·") && /shelf|bookcase|bookshelf/i.test(`${item.asset} ${item.label}`);
const isSeatProp = (item: RoomPropDefinition) => /chair|stool|bench|sofa|couch/i.test(`${item.asset} ${item.label}`);
export const isRoomPropBed = (asset: string) => asset === "kit:bedbunk" || asset === "kit:beddouble" || asset === "kit:bedsingle";
const isSurfaceProp = (item: RoomPropDefinition) => /desk|table|counter/i.test(`${item.asset} ${item.label}`);

function isEnvironmentProp(item: RoomPropDefinition) {
  return item.group?.startsWith("Roads ·") || item.pack === "factory-kit" || item.group === "Industrial"
    || item.group?.startsWith("Nature ·") || item.group === "Forest" && !/weapon/i.test(`${item.asset} ${item.label}`)
    || item.group === "Imported · City Park and Playground"
    || /\b(tree|trees|rock|rocks)\b/i.test(`${item.asset} ${item.label}`);
}

function isBuildingComponent(item: RoomPropDefinition) {
  return item.pack === "building-kit" || item.group === "Building" || item.group === FLOOR_TILE_GROUP_LABEL
    || item.group === "Wall" || item.group?.startsWith("Wall ·");
}

function roomPropEditorRole(item: RoomPropDefinition): RoomPropEditorRole {
  if (FINISHED_BUILDING_PROP_ASSETS.has(item.asset)) return "building-prefab";
  if (item.vehicleId || item.group === "Vehicles" || isEnvironmentProp(item)) return "map-component";
  if (isBuildingComponent(item)) return "building-component";
  return "object";
}

// Computer screens remain surface props even when taller than tabletop decorations.
function isSmallProp(item: RoomPropDefinition) {
  return /computer.?screen|computer.?keyboard|monitor/i.test(`${item.asset} ${item.label}`)
    || (item.height <= SMALL_PROP_MAX_HEIGHT_M && Math.max(item.width, item.depth) <= SMALL_PROP_MAX_FOOTPRINT_M);
}

// A few environment packs use sub-meter source bounds for structures that
// should read at human/world scale on our 1 m placement grid. Scale the whole
// catalog footprint with the model height so placement and collision bounds
// remain aligned with the rendered asset.
const ENVIRONMENT_PROP_SCALE_RATIO: Readonly<Record<string, number>> = {
  "kit-city-kit-industrial-shipping-container-a": 6,
  "kit-city-kit-industrial-shipping-container-b": 6,
  "kit-city-kit-industrial-shipping-container-c": 6,
  "kit-city-kit-industrial-water-tower": 1.5,
  "kit-city-kit-industrial-windmill-low": 1.7,
  "kit-city-kit-industrial-windmill": 1.7,
  "kit-city-kit-industrial-chimney-basic": 2.5,
  "kit-city-kit-industrial-chimney-large": 1.5,
  "kit-city-kit-industrial-chimney-medium": 1.5,
  "kit-city-kit-industrial-chimney-small": 2,
  "kenney-city-kit-suburban-tree-large": 1.4,
};
// The low-poly nature packs are authored for much smaller scenes. At their
// source dimensions they read like shrubs beside an avatar and city buildings.
const CAMPUS_TREE_SCALE_RATIO = 1.9 * 1.5;
function isCampusTreeAsset(asset: string) {
  return asset.startsWith("nature-kenney-nature-kit-tree-")
    || asset.startsWith("kit-mini-forest-tree")
    || asset === "kenney-city-kit-suburban-tree-small"
    || asset === "kenney-city-kit-suburban-tree-large";
}
const INDUSTRIAL_BUILDING_PREFAB_SCALE_RATIO = 3.375;
const FINISHED_BUILDING_SCALE_BOOST_RATIO = 1.5;

function scaledProp(item: RoomPropDefinition): RoomPropDefinition {
  const environmentScale = ENVIRONMENT_PROP_SCALE_RATIO[item.asset] ?? (/^kit-city-kit-industrial-building-[a-t]$/.test(item.asset) ? INDUSTRIAL_BUILDING_PREFAB_SCALE_RATIO : 1);
  const baseScale = environmentScale * (isCampusTreeAsset(item.asset) ? CAMPUS_TREE_SCALE_RATIO : 1);
  const scale = baseScale * (FINISHED_BUILDING_PROP_ASSETS.has(item.asset) ? FINISHED_BUILDING_SCALE_BOOST_RATIO : 1);
  return scale === 1 ? item : {
    ...item,
    width: item.width * scale,
    depth: item.depth * scale,
    height: item.height * scale,
  };
}

function placementClass(item: RoomPropDefinition): RoomPropDefinition["placementClass"] {
  if (isShelfProp(item)) return "shelf";
  if (isSeatProp(item)) return "seat";
  if (isSurfaceProp(item)) return "surface";
  return isSmallProp(item) ? "small" : "floor";
}

function placementHints(item: RoomPropDefinition): Partial<RoomPropDefinition> {
  return {
    placementClass: placementClass(item),
    ...(isShelfProp(item) ? { supportsPlacement: "shelf-top" as const, stackable: true } : {}),
    ...(isSurfaceProp(item) ? { supportsPlacement: "tabletop" as const } : {}),
  };
}

function seatHeightM(item: RoomPropDefinition): number {
  if (isRoomPropBed(item.asset)) {
    const heightRatio = item.asset === "kit:bedbunk" ? BUNK_BED_SEAT_HEIGHT_RATIO : BED_SEAT_HEIGHT_RATIO;
    return item.height * heightRatio;
  }
  if (/stoolbar/i.test(item.asset)) return BAR_STOOL_SEAT_HEIGHT_M;
  if (/sushi-stool/i.test(item.asset)) return SUSHI_STOOL_SEAT_HEIGHT_M;
  // Kenney furniture cushions sit below their decorative backrests; preserve the authored calibration.
  const rule = FURNITURE_SEAT_HEIGHT_RULES.find((entry) => entry.asset.test(item.asset));
  if (rule) return Math.min(item.height * rule.heightRatio, rule.maxHeightM);
  return Math.min(DEFAULT_SEAT_MAX_HEIGHT_M, Math.max(DEFAULT_SEAT_MIN_HEIGHT_M, item.height * DEFAULT_SEAT_HEIGHT_RATIO));
}

function seatHints(item: RoomPropDefinition, footprint: { width: number; depth: number }): Partial<RoomPropDefinition> {
  const bed = isRoomPropBed(item.asset);
  if (!isSeatProp(item) && !bed) return {};
  return {
    interaction: "sit",
    collisionWidth: footprint.width,
    collisionDepth: footprint.depth,
    collisionScale: bed ? 1 : SEAT_COLLISION_SCALE_RATIO,
    collisionClearanceRadius: SEAT_COLLISION_CLEARANCE_RADIUS_M,
    seatHeight: seatHeightM(item),
  };
}

/** Keep placement, collision and rendering dimensions consistent across catalog consumers. */
export function normalizeRoomPropDefinition(item: RoomPropDefinition): RoomPropDefinition {
  const sizedItem = scaledProp(item);
  const footprint = sizedItem.group === FLOOR_TILE_GROUP_LABEL
    ? { width: sizedItem.width, depth: sizedItem.depth }
    : roomPropBlockFootprint(sizedItem.width, sizedItem.depth);
  return {
    ...sizedItem,
    editorRole: roomPropEditorRole(sizedItem),
    width: Math.max(MIN_ROOM_PROP_FOOTPRINT_M, footprint.width),
    depth: Math.max(MIN_ROOM_PROP_FOOTPRINT_M, footprint.depth),
    ...placementHints(sizedItem),
    ...seatHints(sizedItem, footprint),
  };
}
