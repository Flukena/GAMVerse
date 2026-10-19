import { CAMERA } from "@gammyverse/shared";

export const ZOOM_IN_SYMBOL = "+";
export const ZOOM_OUT_SYMBOL = "−";

export type DistanceZoomDirection = "in" | "out";

export type DistanceZoomButton = {
  direction: DistanceZoomDirection;
  /** Conventional glyph: plus zooms in (camera moves closer), minus zooms out. */
  symbol: typeof ZOOM_IN_SYMBOL | typeof ZOOM_OUT_SYMBOL;
  label: string;
  title: string;
  distanceM: number;
  disabled: boolean;
};

/** Third-person zoom buttons in display order: minus on the left, plus on the right. */
export function distanceZoomButtons(distanceM: number, maxDistanceM: number): [DistanceZoomButton, DistanceZoomButton] {
  const stepM = CAMERA.zoomStep;
  return [
    {
      direction: "out",
      symbol: ZOOM_OUT_SYMBOL,
      label: `Zoom out ${stepM} meters`,
      title: `Zoom out ${stepM} m`,
      distanceM: distanceM + stepM,
      disabled: distanceM >= maxDistanceM,
    },
    {
      direction: "in",
      symbol: ZOOM_IN_SYMBOL,
      label: `Zoom in ${stepM} meters`,
      title: `Zoom in ${stepM} m`,
      distanceM: distanceM - stepM,
      disabled: distanceM <= CAMERA.minZoom,
    },
  ];
}
