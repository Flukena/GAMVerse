import type { RoomLayoutZone } from "@gammyverse/shared";
import { CAMPUS_GRASS_COLOR, CAMPUS_STONE_COLOR } from "../zoneFloorColor";

const SURFACE_DETAIL_MIN_SCALE_PX_PER_M = 6;
export type Map2dSurfaceMaterial = "wood" | "carpet" | "tile" | "grass";
export type Map2dSurfaceStyle = { material: Map2dSurfaceMaterial; base: string; seam: string; accent: string };
const SURFACES: Record<Map2dSurfaceMaterial, Map2dSurfaceStyle> = {
  wood: { material: "wood", base: `#${CAMPUS_STONE_COLOR.toString(16)}`, seam: "#dfc9ac", accent: "#f5e9d8" },
  carpet: { material: "carpet", base: "#b8c7c8", seam: "#aababc", accent: "#c1cece" },
  tile: { material: "tile", base: "#e0ece7", seam: "#bfcfc9", accent: "#ecf3ed" },
  grass: { material: "grass", base: `#${CAMPUS_GRASS_COLOR.toString(16)}`, seam: "#b0cba0", accent: "#d3e3c6" },
};

export function map2dSurfaceStyle(kind: RoomLayoutZone["kind"] | null, outdoor = false): Map2dSurfaceStyle {
  if (outdoor) return SURFACES.grass;
  if (kind === "private") return SURFACES.carpet;
  if (kind === "restroom") return SURFACES.tile;
  return SURFACES.wood;
}

export function map2dSurfaceDetailVisible(pxPerM: number): boolean {
  return pxPerM >= SURFACE_DETAIL_MIN_SCALE_PX_PER_M;
}
