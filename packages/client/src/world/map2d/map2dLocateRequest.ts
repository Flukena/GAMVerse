import { locateMap2d, type Map2dLocateRequest } from "./map2dInput";
import type { Map2dPoint } from "./map2dProjection";

const INITIAL_LOCATE_REQUEST_ID = 0;

export class Map2dLocateRequests {
  private lastRequestId = INITIAL_LOCATE_REQUEST_ID;

  consume(
    request: Map2dLocateRequest | null | undefined,
    players: ReadonlyMap<string, Map2dPoint>,
    nowMs: number,
  ): ReturnType<typeof locateMap2d> | null {
    if (!request || request.requestId === this.lastRequestId) return null;
    this.lastRequestId = request.requestId;
    const target = request.center ?? (request.sessionId ? players.get(request.sessionId) : undefined);
    return target ? locateMap2d(target, request.sessionId ?? "", nowMs) : null;
  }
}
