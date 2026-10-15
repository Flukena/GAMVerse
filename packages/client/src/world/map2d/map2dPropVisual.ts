export type Map2dPropKind = "table" | "chair" | "sofa" | "bench" | "monitor" | "storage" | "bookcase" | "plant" | "tree" | "fallback";
export const MAP2D_PROP_DETAIL_MIN_SIZE_PX = 12;
const PROP_KIND_PATTERNS: readonly [RegExp, Map2dPropKind][] = [
  [/^(?:kit:)?computerscreen$/, "monitor"],
  [/^(?:kit:)?(?:desk|table(?:coffee(?:glass)?(?:square)?|glass|round|cross(?:cloth)?)?|sidetable(?:drawers)?)$|^quaternius-sushi-table$/, "table"],
  [/^(?:kit:)?(?:chair(?:desk|cushion|rounded)?|loungechair(?:relax)?)$|^quaternius-sushi-chair-[12]$/, "chair"],
  [/^kit:loungesofa(?:long|ottoman)?$|^quaternius-(?:sushi-sofa|zombie-couch)$/, "sofa"],
  [/^kit:bench(?:cushion(?:low)?)?$|^quaternius-sushi-bench$/, "bench"],
  [/^kit:bookcaseopen(?:low)?$|^office-wall-shelf$/, "bookcase"],
  [/^kit:(?:bookcaseclosed(?:doors|wide)?|cabinetbed(?:drawer(?:table)?)?)$/, "storage"],
  [/^(?:kit:)?pottedplant$|^quaternius-sushi-plant-[12]$/, "plant"],
  [/(?:^|[-:])tree(?:[-_](?:small|large|tall|round|pine|oak|[a-z]|\d+))?$|(?:^|[-:])(?:pine|sapling)$/, "tree"],
];
/** Asset names are deliberately specific: pack/group names must not replace unrelated objects. */
export function map2dPropKind(asset: string): Map2dPropKind {
  return PROP_KIND_PATTERNS.find(([pattern]) => pattern.test(asset.toLowerCase()))?.[1] ?? "fallback";
}
export function map2dPropDetailVisible(widthPx: number, depthPx: number): boolean {
  return Math.min(widthPx, depthPx) >= MAP2D_PROP_DETAIL_MIN_SIZE_PX;
}
