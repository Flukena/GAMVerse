import { LOCATE_PULSE_MS, MAP2D_PICK_RADIUS_PX } from "./constants";
import {
  worldToScreen,
  type Map2dPoint,
  type Map2dProjection,
  type ScreenPoint,
} from "./map2dProjection";
export function pickMap2dPlayer(
  projection: Map2dProjection,
  players: ReadonlyMap<string, Map2dPoint>,
  point: ScreenPoint,
): string | null {
  let nearest: string | null = null;
  let distancePx = MAP2D_PICK_RADIUS_PX;
  for (const [id, player] of players) {
    const screen = worldToScreen(projection, player);
    const candidatePx = Math.hypot(point.x - screen.x, point.y - screen.y);
    if (candidatePx < distancePx) {
      nearest = id;
      distancePx = candidatePx;
    }
  }
  return nearest;
}
export function locateMap2d(
  center: Map2dPoint,
  sessionId: string,
  nowMs: number,
) {
  return {
    center,
    following: false,
    view: "2d" as const,
    decoration: { sessionId, text: "◎", expiresAtMs: nowMs + LOCATE_PULSE_MS },
  };
}
export type Map2dLocateRequest = {
  sessionId?: string;
  center?: Map2dPoint;
  requestId: number;
};
