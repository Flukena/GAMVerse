import type { Position, RoomLayout, WorldConfig } from "@gammyverse/shared";

/** All messages crossing the worker boundary are structured-clone safe. */
export type RouteSearchPriority = "interactive" | "follow" | "seat";
export type RouteSearchSnapshot = { roomId: string; revision: number; world: WorldConfig; seatLayout?: Pick<RoomLayout, "props" | "zones"> };
export type RouteSeatSearch = {
  zoneId: string;
  occupiedSeatIds: string[];
  preferredPoint: Position;
};
export type RouteMeetCandidate = {
  firstStart: Position;
  firstDestination: Position;
  secondStart: Position;
  secondDestination: Position;
};
export type RouteSearchRequest = {
  roomId: string;
  sessionId: string;
  requestId: string;
  revision: number;
  start: Position;
  destination: Position;
  priority: RouteSearchPriority;
  mode?: "route" | "seat" | "approach" | "meet-room";
  seatSearch?: RouteSeatSearch;
  /** Ordered, server-derived options for one public conversation approach. */
  approachDestinations?: Position[];
  /** Ordered, server-derived paired destinations for a two-person meeting. */
  meetRoomCandidates?: RouteMeetCandidate[];
  /** Per-request mover layer; static collision remains in the cached snapshot. */
  dynamicCollisionGrid?: NonNullable<WorldConfig["dynamicCollisionGrid"]>;
  excludedVehiclePropId?: string;
  playerRadius?: number;
  /** Server-derived denied-zone blockers for this specific caller. */
  accessBlockers?: readonly WorldConfig["obstacles"][number][];
};
export type RouteSearchResult = {
  points: Position[] | null;
  propId?: string;
  zoneId?: string;
  destination?: Position;
  routes?: Array<{ points: Position[]; destination: Position }>;
};

/** Compose only a shallow route view; cached static arrays/grids are shared unchanged. */
export function routeSearchWorld(snapshot: RouteSearchSnapshot, request: RouteSearchRequest): WorldConfig {
  return {
    ...snapshot.world,
    playerRadius: request.playerRadius ?? snapshot.world.playerRadius,
    dynamicCollisionGrid: request.dynamicCollisionGrid,
    excludedVehiclePropId: request.excludedVehiclePropId,
    accessOverlay: request.accessBlockers,
  };
}

export type RouteWorkerMessage =
  | { type: "snapshot"; snapshot: RouteSearchSnapshot }
  | { type: "search"; request: RouteSearchRequest }
  | { type: "shutdown" };
export type RouteWorkerResponse =
  | { type: "snapshot-ready"; roomId: string; revision: number }
  | { type: "result"; requestId: string; result: RouteSearchResult }
  | { type: "error"; requestId?: string; message: string };

export type RouteSearchAdmission =
  | { status: "queued"; requestId: string; jobId: string }
  | { status: "busy"; requestId: string; reason: "global-cap" | "room-cap" | "session-cap" | "stale-snapshot" | "disposed" }
  | { status: "cancelled"; requestId: string };
