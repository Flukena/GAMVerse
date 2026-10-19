import { avatarSpriteScreenRect, avatarSpriteScale } from "./avatarSpriteGeometry";
import { LOCATE_PULSE_MS, MAP2D_DRAG_THRESHOLD_PX, MAP2D_PICK_RADIUS_PX } from "./constants";
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
  const pickRadiusPx = MAP2D_PICK_RADIUS_PX * avatarSpriteScale(projection.pxPerM);
  let distancePx = pickRadiusPx;
  for (const [id, player] of players) {
    const screen = worldToScreen(projection, player);
    const candidatePx = Math.hypot(point.x - screen.x, point.y - screen.y);
    const body = avatarSpriteScreenRect(screen.x, screen.y, projection.pxPerM);
    const hitsBody = point.x >= body.x && point.x <= body.x + body.width && point.y >= body.y && point.y <= body.y + body.height;
    if ((hitsBody || candidatePx < pickRadiusPx) && (nearest === null || candidatePx < distancePx)) {
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

export function isMap2dDrag(start: ScreenPoint, point: ScreenPoint): boolean {
  return Math.hypot(point.x - start.x, point.y - start.y) >= MAP2D_DRAG_THRESHOLD_PX;
}
