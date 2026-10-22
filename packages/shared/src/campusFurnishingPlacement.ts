import { campusStarterPlacements } from "./campusFurnishingTemplates.js";
import type { StarterPlacement } from "./campusFurnishingTypes.js";
import { TEAM_MEETING_PROP_BUDGET_COUNT } from "./campusTeamMeetingTemplate.js";
import { CIVIC_TOWNHALL_PROP_BUDGET_COUNT } from "./campusCivicRoomTemplates.js";
import { MAX_OFFICE_PROPS } from "./officePropLimits.js";
import { ROOM_PROP_CATALOG } from "./roomPropCatalog.js";
import { roomPropPlacementSupport } from "./roomLayout.js";
import type { RoomLayout, RoomLayoutZone } from "./roomLayoutTypes.js";
import type { RoomLayoutProp } from "./roomPropTypes.js";

const MAX_STARTER_ROOM_PROPS_COUNT = 72;
const DEFAULT_ROTATION_RAD = 0;
const PROP_LIMIT_LABEL = "This furnished starter exceeds the office prop limit. Choose fewer people or Empty interiors.";
const ROOM_BUDGET_LABEL = "The starter room exceeds its furnishing budget.";
const MISSING_ASSET_LABEL = "A starter furnishing asset is unavailable.";
const MISSING_SUPPORT_LABEL = "A starter furnishing needs a compatible supporting surface.";
const OUTSIDE_ROOM_LABEL = "A starter furnishing does not fit inside its room.";

function starterProp(zone: RoomLayoutZone, placement: StarterPlacement, placed: readonly RoomLayoutProp[]): RoomLayoutProp {
  const catalog = ROOM_PROP_CATALOG.find(item => item.asset === placement.asset);
  if (!catalog) throw new Error(MISSING_ASSET_LABEL);
  const prop: RoomLayoutProp = {
    id: `${zone.id}-starter-${placement.key}`, asset: catalog.asset,
    x: zone.x + placement.xM, z: zone.z + placement.zM, rotation: placement.rotationRad ?? DEFAULT_ROTATION_RAD,
    width: catalog.width, depth: catalog.depth, collision: catalog.collision,
  };
  assertFitsRoom(zone, prop);
  if (placement.supported) {
    const support = roomPropPlacementSupport(placed, prop.asset, prop.x, prop.z, prop.rotation);
    if (!support) throw new Error(MISSING_SUPPORT_LABEL);
    prop.elevation = support.elevation;
  }
  return prop;
}

function assertFitsRoom(zone: RoomLayoutZone, prop: RoomLayoutProp) {
  const cos = Math.abs(Math.cos(prop.rotation));
  const sin = Math.abs(Math.sin(prop.rotation));
  const halfWidthM = (prop.width * cos + prop.depth * sin) / 2;
  const halfDepthM = (prop.width * sin + prop.depth * cos) / 2;
  if (Math.abs(prop.x - zone.x) + halfWidthM >= zone.width / 2 || Math.abs(prop.z - zone.z) + halfDepthM >= zone.depth / 2) throw new Error(OUTSIDE_ROOM_LABEL);
}

/** Creation-only: append starter objects to a fresh generated layout, preserving its landscaping. */
export function appendCampusStarterProps(layout: RoomLayout): RoomLayoutProp[] {
  const props = [...layout.props];
  for (const zone of layout.zones) {
    const placements = campusStarterPlacements(zone);
    const roomBudget = zone.id === "shared-townhall" ? CIVIC_TOWNHALL_PROP_BUDGET_COUNT
      : /^meeting-(north|south)-/.test(zone.id) && zone.width >= 40 && zone.depth >= 20 ? TEAM_MEETING_PROP_BUDGET_COUNT : MAX_STARTER_ROOM_PROPS_COUNT;
    if (placements.length > roomBudget) throw new Error(ROOM_BUDGET_LABEL);
    if (props.length + placements.length > MAX_OFFICE_PROPS) throw new Error(PROP_LIMIT_LABEL);
    const roomProps: RoomLayoutProp[] = [];
    for (const placement of placements) roomProps.push(starterProp(zone, placement, roomProps));
    props.push(...roomProps);
  }
  if (props.length > MAX_OFFICE_PROPS) throw new Error(PROP_LIMIT_LABEL);
  return props;
}
