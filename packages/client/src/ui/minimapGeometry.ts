import type { ScreenPoint } from "../world/map2d/map2dProjection";

export function minimapCanvasPoint(
  pointer: ScreenPoint,
  displayedSize: { width: number; height: number },
  canvasSize: { width: number; height: number },
): ScreenPoint {
  return {
    x: pointer.x * canvasSize.width / displayedSize.width,
    y: pointer.y * canvasSize.height / displayedSize.height,
  };
}
