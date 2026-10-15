import type { Position } from "@gammyverse/shared";

export const AUTO_MOVE_MAX_DRIVE_DURATION_SECONDS = 1.75;

export function autoMoveRouteLength(start: Position, points: readonly Position[]) {
  let total = 0;
  let previous = start;
  for (const point of points) {
    total += Math.hypot(point.x - previous.x, point.z - previous.z);
    previous = point;
  }
  return total;
}

export function autoMoveDriveSpeed(start: Position, points: readonly Position[], normalSpeed: number) {
  const routeLength = autoMoveRouteLength(start, points);
  return routeLength === 0 ? normalSpeed : Math.max(normalSpeed, routeLength / AUTO_MOVE_MAX_DRIVE_DURATION_SECONDS);
}
