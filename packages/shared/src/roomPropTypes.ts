import type { PropInteraction } from "./propInteraction.js";

export type RoomLayoutProp = {
  id: string;
  asset: string;
  x: number;
  z: number;
  rotation: number;
  collision: boolean;
  width: number;
  depth: number;
  /** Height above the floor, used for supported tabletop/shelf placement. */
  elevation?: number;
  interaction?: PropInteraction;
};
export type RoomPropEditorRole = "object" | "building-component" | "map-component" | "building-prefab";
export type RoomPropDefinition = Pick<
  RoomLayoutProp,
  "asset" | "width" | "depth" | "collision"
> & {
  label: string;
  /** Which editor owns this item: props, modular building parts, road/map components, or map prefabs. */
  editorRole?: RoomPropEditorRole;
  height: number;
  model?: string;
  modelUrl?: string;
  materialUrl?: string;
  pack?: string;
  format?: "gltf";
  group?: string;
  preview?: string;
  wallAxis?: "x" | "z";
  geometry?:
    | "townhall-stage"
    | "townhall-podium"
    | "restroom-partition"
    | "wayfinding-sign"
    | "wall-picture"
    | "wall-shelf";
  /** Wall-mounted props save their vertical offset without needing a tabletop. */
  wallMounted?: boolean;
  /** Natural model footprint used by movement collision when editor cells are larger. */
  collisionWidth?: number;
  collisionDepth?: number;
  /** Seat collision is slightly inset from decorative edges, with a smaller movement clearance. */
  collisionScale?: number;
  collisionClearanceRadius?: number;
  /** A surface that can support small items when vertical placement is implemented. */
  supportsPlacement?: "tabletop" | "shelf-top";
  /** This item is small enough to be placed on a supporting surface. */
  placementClass?: "floor" | "small" | "shelf" | "surface" | "seat";
  /** Shelving units can be stacked; seat props can offer a sit interaction. */
  stackable?: boolean;
  interaction?: "sit";
  /** Approximate height of the usable seat surface above the prop base. */
  seatHeight?: number;
  /** Vehicles are driveable when placed as office props. */
  vehicleId?: string;
};
