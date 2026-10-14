import {
  MAP2D_MIN_SCALE_PX_PER_M,
  MAP2D_MAX_SCALE_PX_PER_M,
  MAP2D_ZOOM_WHEEL_FACTOR_PER_PX,
} from "./constants";

export type Map2dPoint = { x: number; z: number };
export type ScreenPoint = { x: number; y: number };
/** Projection uses CSS pixels. DPR affects canvas backing resolution only. */
export type Map2dProjection = {
  center: Map2dPoint;
  pxPerM: number;
  widthPx: number;
  heightPx: number;
  dpr: number;
};
export function worldToScreen(
  projection: Map2dProjection,
  point: Map2dPoint,
): ScreenPoint {
  return {
    x:
      projection.widthPx / 2 +
      (point.x - projection.center.x) * projection.pxPerM,
    y:
      projection.heightPx / 2 +
      (point.z - projection.center.z) * projection.pxPerM,
  };
}
export function screenToWorld(
  projection: Map2dProjection,
  point: ScreenPoint,
): Map2dPoint {
  return {
    x:
      projection.center.x +
      (point.x - projection.widthPx / 2) / projection.pxPerM,
    z:
      projection.center.z +
      (point.y - projection.heightPx / 2) / projection.pxPerM,
  };
}

export function fitMap2dProjection(
  widthM: number,
  depthM: number,
  widthPx: number,
  heightPx: number,
): Map2dProjection {
  return {
    center: { x: 0, z: 0 },
    pxPerM: Math.min(widthPx / widthM, heightPx / depthM),
    widthPx,
    heightPx,
    dpr: 1,
  };
}

export function clampMap2dScale(pxPerM: number): number {
  return Math.min(
    MAP2D_MAX_SCALE_PX_PER_M,
    Math.max(MAP2D_MIN_SCALE_PX_PER_M, pxPerM),
  );
}

/** Wheel zoom: scrolling up (negative deltaY) zooms in. Result is clamped. */
export function map2dWheelScale(pxPerM: number, deltaYPx: number): number {
  return clampMap2dScale(
    pxPerM * Math.exp(-deltaYPx * MAP2D_ZOOM_WHEEL_FACTOR_PER_PX),
  );
}
