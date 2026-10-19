import type { RoomPropDefinition } from "@gammyverse/shared";

export const MODIFY_PROPS_CATEGORIES = [
  "Seating",
  "Furniture & Workspaces",
  "Walls & Openings",
  "Floors & Paths",
  "Nature & Landscaping",
  "Street & Vehicles",
  "Lights & Signs",
  "Food & Kitchen",
  "Decor & Equipment",
] as const;

export const MODIFY_PROPS_SECTIONS = ["Objects", "Building components"] as const;
export type ModifyPropsSection = (typeof MODIFY_PROPS_SECTIONS)[number];

export type ModifyPropsCategory = (typeof MODIFY_PROPS_CATEGORIES)[number];

const SEATING_PATTERN = /\b(chair|seat|sofa|couch|bench|stool|armchair|ottoman)\b/i;
const TABLE_PATTERN = /\b(table|desk|counter|workbench|podium|surface)\b/i;
const STORAGE_PATTERN = /\b(shelf|shelves|bookcase|cabinet|drawer|locker|wardrobe|cupboard|chest|container|crate|rack|pedestal|storage|box)\b/i;
const WORKSPACE_PATTERN = /\b(monitor|keyboard|mouse|laptop|computer|desk|table|workstation|bed|rug|mirror|tv unit|television|book|notebook|cable tray|radiator|bathtub|mug)\b/i;
const WALL_PATTERN = /\b(wall|door|doorway|window|partition|fence|gate|opening)\b/i;
const FLOOR_PATTERN = /\b(floor|tile|road|path|driveway|ground|terrain)\b/i;
const NATURE_PATTERN = /\b(tree|plant|flower|bush|grass|rock|mushroom|fern|foliage|stump|log|planter)\b/i;
const LIGHT_PATTERN = /\b(light|lamp|lantern|sign|signal|traffic light|wayfinding)\b/i;
const FOOD_PATTERN = /\b(food|sushi|plate|bowl|cup|dish|drink|kitchen|oven|fridge|sink|cook)\b/i;

export function classifyModifyProp(item: Pick<RoomPropDefinition, "asset" | "label" | "group" | "wallMounted" | "placementClass" | "vehicleId" | "editorRole">): ModifyPropsCategory | "Building components" | "Finished buildings" | "Map components" {
  const searchText = `${item.asset} ${item.label}`;
  const group = item.group ?? "";

  if (item.editorRole === "building-prefab") return "Finished buildings";
  if (item.editorRole === "map-component") return "Map components";
  if (item.editorRole === "building-component") return "Building components";
  if (group.startsWith("Nature ·")) return "Nature & Landscaping";
  if (item.placementClass === "seat" || SEATING_PATTERN.test(searchText)) return "Seating";
  if (group === "Floor tiles" || group === "Roads · Tiles" || group === "Roads · Paths" || FLOOR_PATTERN.test(searchText)) return "Floors & Paths";
  if (item.placementClass === "surface" || TABLE_PATTERN.test(searchText) || item.placementClass === "shelf" || STORAGE_PATTERN.test(searchText) || WORKSPACE_PATTERN.test(searchText)) return "Furniture & Workspaces";
  if (item.wallMounted || group.startsWith("Wall") || WALL_PATTERN.test(searchText)) return "Walls & Openings";
  if (/forest|nature|landscap|park/i.test(group) || NATURE_PATTERN.test(searchText)) return "Nature & Landscaping";
  if (group === "Roads · Signs" || LIGHT_PATTERN.test(searchText)) return "Lights & Signs";
  if (item.vehicleId || group === "Vehicles" || group.startsWith("Roads · Street") || /\b(vehicle|car|truck|taxi|bus|traffic barrier|cone|hydrant|trash ?can|trash ?bin|street light)\b/i.test(searchText)) return "Street & Vehicles";
  if (group === "Food" || /sushi|restaurant/i.test(group) || FOOD_PATTERN.test(searchText)) return "Food & Kitchen";
  return "Decor & Equipment";
}
