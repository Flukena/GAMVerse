export type Map2dPresentation = "simplified" | "immersive";
export type Map2dPresentationPreference = Map2dPresentation | "auto";
export const MAP2D_PRESENTATION_STORAGE_KEY = "gammyverse.map2d.presentation.v1";
export const MAP2D_SIMPLIFIED_ENTER_SCALE_PX_PER_M = 8;
export const MAP2D_IMMERSIVE_ENTER_SCALE_PX_PER_M = 12;
const MAP2D_INITIAL_IMMERSIVE_SCALE_PX_PER_M = 10;

export function parseMap2dPresentationPreference(value: string | null): Map2dPresentationPreference {
  return value === "simplified" || value === "immersive" ? value : "auto";
}
export function resolveMap2dPresentation(preference: Map2dPresentationPreference, scalePxPerM: number,
  previous?: Map2dPresentation): Map2dPresentation {
  if (preference !== "auto") return preference;
  if (scalePxPerM <= MAP2D_SIMPLIFIED_ENTER_SCALE_PX_PER_M) return "simplified";
  if (scalePxPerM >= MAP2D_IMMERSIVE_ENTER_SCALE_PX_PER_M) return "immersive";
  return previous ?? (scalePxPerM >= MAP2D_INITIAL_IMMERSIVE_SCALE_PX_PER_M ? "immersive" : "simplified");
}
