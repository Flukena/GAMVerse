import type { RoomLayoutProp } from "./roomPropTypes.js";
import { EXTERNAL_WALL_ASSET_IDS } from "./externalRoomProps.js";

/** Office-owned shared props snapshot; configVersion is independent from the admin map version. */
export type OfficePropsSnapshot = { props: RoomLayoutProp[]; configVersion: number };

export type RoomLayoutZone = { id: string; name: string; kind: "private" | "meeting" | "restroom"; ownerUsername?: string; x: number; z: number; width: number; depth: number; color: string };

const BUILT_IN_WALL_MODEL_ASSETS = ["kit-building-kit-wall-half", "poly-kitchen-wall-plain", "poly-kitchen-wall-plain-detail", "poly-kitchen-wall-tiles", "poly-kitchen-wall-tiles-w", "quaternius-sushi-wall-normal", "quaternius-sushi-wall-redwood", "quaternius-sushi-wall-shelves", "quaternius-sushi-wall-shoji", "quaternius-sushi-wall-shoji-interior"] as const;
export const ROOM_WALL_MODEL_ASSETS = [...BUILT_IN_WALL_MODEL_ASSETS, ...EXTERNAL_WALL_ASSET_IDS] as const;
export const ROOM_DOOR_FRAME_ASSETS = ["kit-building-kit-wall-doorway-square"] as const;
export type RoomLayoutWall = { id: string; axis: "horizontal" | "vertical"; x: number; z: number; length: number; thickness: number; height: number; color?: string; asset?: (typeof ROOM_WALL_MODEL_ASSETS)[number] };
export type RoomLayoutDoor = { id: string; wallId: string; offset: number; width: number; kind?: "door" | "opening"; leaves?: 1 | 2; asset?: (typeof ROOM_DOOR_FRAME_ASSETS)[number] };
export type RoomLayoutRoadway = { id: string; x: number; z: number; width: number; depth: number; kind: "major" | "small" };
export type RoomLayout = { version: 1; props: RoomLayoutProp[]; zones: RoomLayoutZone[]; walls: RoomLayoutWall[]; doors: RoomLayoutDoor[]; roadways?: RoomLayoutRoadway[]; dimensions?: { width: number; depth: number }; spawnPoint?: { x: number; z: number } };
