import type { RoomLayoutWall, RoomLayoutDoor } from "@gammyverse/shared";

const MAP2D_PROP_HUE_RANGE_DEG = 360;
const MAP2D_PROP_GROUP_HASH_MULTIPLIER = 31;
const MAP2D_PROP_SATURATION_PERCENT = 48;
const MAP2D_PROP_LIGHTNESS_PERCENT = 56;
export const MAP2D_GRID_MIN_SCALE_PX_PER_M = 16;
export const MAP2D_GRID_SPACING_M = 1;
export const MAP2D_ZONE_LABEL_MIN_SCALE_PX_PER_M = 5;
export const MAP2D_ZONE_LABEL_MIN_FONT_PX = 10;
export const MAP2D_ZONE_LABEL_MAX_FONT_PX = 18;
export const MAP2D_WALL_MIN_THICKNESS_PX = 3;
export const MAP2D_DETAIL_PALETTE = {
  grass: "#c4d9b4", floor: "#efe1cc", grid: "#ded6c5", asphalt: "#798782",
  roadLine: "#f9e6a0", wall: "#293c4a", door: "#d49d49", border: "#566c70",
  zone: { private: "#d6dfee", meeting: "#f0dfbd", restroom: "#c5e5df" },
  props: { nature: "#498957", furniture: "#bf8647", vehicles: "#467da6", technology: "#8772ac", walls: "#6e7783", outdoor: "#bb6860" },
} as const;
export function map2dGridVisible(pxPerM: number): boolean {
  return pxPerM >= MAP2D_GRID_MIN_SCALE_PX_PER_M;
}
export function map2dZoneLabelFontPx(pxPerM: number): number {
  if (pxPerM < MAP2D_ZONE_LABEL_MIN_SCALE_PX_PER_M) return 0;
  return Math.min(MAP2D_ZONE_LABEL_MAX_FONT_PX, Math.max(MAP2D_ZONE_LABEL_MIN_FONT_PX, pxPerM));
}
export function map2dWallThicknessPx(thicknessM: number, pxPerM: number): number {
  return Math.max(MAP2D_WALL_MIN_THICKNESS_PX, thicknessM * pxPerM);
}
/** Coordinates are local to the footprint; its canvas transform applies rotation. */
export function fitPropIconRect(imageWidthPx: number, imageHeightPx: number, widthPx: number, depthPx: number) {
  const scale = Math.min(widthPx / imageWidthPx, depthPx / imageHeightPx);
  const width = imageWidthPx * scale;
  const height = imageHeightPx * scale;
  return { x: -width / 2, y: -height / 2, width, height };
}
function groupFallbackColor(group: string): string {
  if (!group) return MAP2D_DETAIL_PALETTE.props.furniture;
  let hash = 0;
  for (const character of group)
    hash = Math.imul(hash, MAP2D_PROP_GROUP_HASH_MULTIPLIER) + character.charCodeAt(0);
  const hueDeg = (hash >>> 0) % MAP2D_PROP_HUE_RANGE_DEG;
  return `hsl(${hueDeg} ${MAP2D_PROP_SATURATION_PERCENT}% ${MAP2D_PROP_LIGHTNESS_PERCENT}%)`;
}
export function map2dPropStyle(group: string, asset: string) {
  const palette = MAP2D_DETAIL_PALETTE.props;
  const circle = /nature|tree|plant|foliage/i.test(`${group} ${asset}`);
  if (circle) return { color: palette.nature, circle };
  const categories = [
    [/vehicle|car/i, palette.vehicles], [/computer|tech|electronic/i, palette.technology],
    [/wall|floor|building/i, palette.walls], [/outdoor|road/i, palette.outdoor],
    [/furniture|table|chair|desk|seat/i, palette.furniture],
  ] as const;
  const category = categories.find(([pattern]) => pattern.test(`${group} ${asset}`));
  return { color: category?.[1] ?? groupFallbackColor(group), circle };
}

export function map2dWallFootprint(wall: RoomLayoutWall, pxPerM: number) {
  const thicknessM = map2dWallThicknessPx(wall.thickness, pxPerM) / pxPerM;
  const horizontal = wall.axis === "horizontal";
  return { x: wall.x, z: wall.z, width: horizontal ? wall.length : thicknessM, depth: horizontal ? thicknessM : wall.length };
}
export function map2dDoorFootprint(wall: RoomLayoutWall, door: RoomLayoutDoor, thicknessM: number) {
  const horizontal = wall.axis === "horizontal";
  return {
    x: wall.x + (horizontal ? door.offset : 0),
    z: wall.z + (horizontal ? 0 : door.offset),
    width: horizontal ? door.width : thicknessM,
    depth: horizontal ? thicknessM : door.width,
  };
}
