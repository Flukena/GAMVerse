import { ROOM_PROP_CATALOG } from "./roomPropCatalog.js";
import { ROOM_WALL_MODEL_ASSETS } from "./roomLayoutTypes.js";
import type { RoomLayoutProp } from "./roomPropTypes.js";

const ROOM_WALL_ASSET_SET = new Set<string>(ROOM_WALL_MODEL_ASSETS);
const WALL_STRUCTURE_ASSET = /(?:^|[-\s])wall(?:$|[-\s])|structure-(?:corner|window)(?:-|$)/i;

/** Props that visually form a wall and must remain solid while Ghost mode is active. */
export function isRoomWallProp(prop: Pick<RoomLayoutProp, "asset">) {
  const definition = ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset);
  if (definition?.wallMounted) return false;
  return ROOM_WALL_ASSET_SET.has(prop.asset) || WALL_STRUCTURE_ASSET.test(`${prop.asset} ${definition?.label ?? ""}`);
}
