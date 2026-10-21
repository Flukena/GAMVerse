import { ROOM_PROP_CATALOG, type RoomLayoutProp } from "@gammyverse/shared";
import { worldToScreen, type Map2dProjection } from "./map2dProjection";
import { MAP2D_DETAIL_PALETTE, map2dPropStyle } from "./map2dStaticDetail";
import { drawMap2dPropImage } from "./map2dPropImageDrawing";
import { map2dPropDetailVisible, map2dPropKind, type Map2dPropKind } from "./map2dPropVisual";
import { hasTopdownPropImage, propPreviewImages } from "./propPreviewImages";

const PROP_DEFINITIONS = new Map(ROOM_PROP_CATALOG.map(item => [item.asset, item]));
const OUTLINE_WIDTH_PX = 1;
const FULL_CIRCLE_RAD = Math.PI * 2;
const SHADOW_OFFSET_RATIO = 0.045;
const EDGE_RADIUS_RATIO = 0.065;
const HALF_RATIO = 0.5;
const INTERACTION_GLYPH = "↗";
const INTERACTION_FONT_PX = 10;
const INTERACTION_BADGE_RADIUS_PX = 7;
const INTERACTION_BADGE_OFFSET_MAX_PX = 16;
const INTERACTION_BADGE_OFFSET_RATIO = 0.3;
const INTERACTION_BADGE_BACKGROUND = "#f9f6e9";
const INTERACTION_BADGE_INK = "#38534c";
const SURFACE = {
  wood: "#c7a37d", woodEdge: "#927455", woodLight: "#e1c6a1", grain: "#b58d65",
  cloth: "#79918e", clothEdge: "#4e6967", cushion: "#a8bab1", highlight: "#d5dace",
  monitor: "#3f5059", screen: "#97bfc6", screenLight: "#c6dfe0", shadow: "#263d3824",
  pot: "#bc886b", soil: "#665849", leaf: "#618c58", leafLight: "#8ba870", leafDark: "#426e49",
  books: ["#bd8679", "#8caaa4", "#d2b67c", "#8695a4", "#a6ad89"],
} as const;
type LocalRect = readonly [xRatio: number, yRatio: number, widthRatio: number, depthRatio: number];
const FULL_RECT_RATIO: LocalRect = [-0.5, -0.5, 1, 1];
const TABLE_INSET_RATIO: LocalRect = [-0.44, -0.43, 0.88, 0.82];
const TABLE_HIGHLIGHT_RATIO: LocalRect = [-0.41, -0.4, 0.82, 0.035];
const TABLE_GRAIN_RECTS_RATIO: readonly LocalRect[] = [[-0.34, -0.12, 0.53, 0.012], [-0.12, 0.18, 0.44, 0.012]];
const SEAT_CUSHION_RATIO: LocalRect = [-0.36, -0.18, 0.72, 0.57];
const SEAT_BACK_RATIO: LocalRect = [-0.46, -0.46, 0.92, 0.23];
const SEAT_HIGHLIGHT_RATIO: LocalRect = [-0.35, -0.4, 0.7, 0.035];
const SOFA_ARM_RECTS_RATIO: readonly LocalRect[] = [[-0.46, -0.2, 0.13, 0.62], [0.33, -0.2, 0.13, 0.62]];
const SOFA_SEAM_RATIO: LocalRect = [-0.009, -0.12, 0.018, 0.43];
const BENCH_SLATS_RATIO: readonly LocalRect[] = [[-0.44, -0.32, 0.88, 0.025], [-0.44, 0, 0.88, 0.025], [-0.44, 0.32, 0.88, 0.025]];
const MONITOR_SCREEN_RATIO: LocalRect = [-0.42, -0.38, 0.84, 0.6];
const MONITOR_STAND_RATIO: LocalRect = [-0.19, 0.27, 0.38, 0.16];
const SCREEN_REFLECTION_RATIO: LocalRect = [-0.34, -0.28, 0.45, 0.055];
const STORAGE_INSET_RATIO: LocalRect = [-0.43, -0.32, 0.86, 0.65];
const STORAGE_PANEL_RATIO: LocalRect = [-0.43, -0.4, 0.86, 0.75];
const STORAGE_HANDLE_RATIO: LocalRect = [-0.14, 0.28, 0.28, 0.05];
const BOOK_START_X_RATIO = -0.36;
const BOOK_STEP_X_RATIO = 0.15;
const BOOK_WIDTH_RATIO = 0.11;
const BOOK_TOP_Y_RATIO = -0.26;
const BOOK_DEPTH_RATIO = 0.5;
const POT_RADIUS_RATIO = 0.39;
const SOIL_RADIUS_RATIO = 0.3;
const CANOPY_RADIUS_RATIO = 0.46;
const LEAF_RADIUS_RATIO = 0.23;
const LEAF_CENTERS_RATIO = [[-0.2, -0.08], [0.06, -0.23], [0.22, 0.02], [0.02, 0.19], [-0.17, 0.17]] as const;
const LEAF_COLORS = [SURFACE.leaf, SURFACE.leafLight, SURFACE.leaf, SURFACE.leafDark, SURFACE.leafLight];

function rect(ctx: CanvasRenderingContext2D, bounds: LocalRect, color: string, outline = false) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(...bounds, EDGE_RADIUS_RATIO);
  ctx.fill();
  if (outline) ctx.stroke();
}
function circle(ctx: CanvasRenderingContext2D, xRatio: number, yRatio: number, radiusRatio: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(xRatio, yRatio, radiusRatio, 0, FULL_CIRCLE_RAD); ctx.fill();
}
function drawTable(ctx: CanvasRenderingContext2D, detail: boolean) {
  ctx.strokeStyle = SURFACE.woodEdge;
  rect(ctx, FULL_RECT_RATIO, SURFACE.wood, true);
  if (!detail) return;
  rect(ctx, TABLE_INSET_RATIO, SURFACE.woodLight);
  rect(ctx, TABLE_HIGHLIGHT_RATIO, SURFACE.highlight);
  for (const grain of TABLE_GRAIN_RECTS_RATIO) rect(ctx, grain, SURFACE.grain);
}
function drawSeat(ctx: CanvasRenderingContext2D, detail: boolean, sofa: boolean) {
  ctx.strokeStyle = SURFACE.clothEdge;
  rect(ctx, FULL_RECT_RATIO, SURFACE.cloth, true);
  if (!detail) return;
  rect(ctx, SEAT_CUSHION_RATIO, SURFACE.cushion, true);
  rect(ctx, SEAT_BACK_RATIO, SURFACE.cloth);
  rect(ctx, SEAT_HIGHLIGHT_RATIO, SURFACE.highlight);
  if (!sofa) return;
  for (const arm of SOFA_ARM_RECTS_RATIO) rect(ctx, arm, SURFACE.cloth);
  rect(ctx, SOFA_SEAM_RATIO, SURFACE.cloth);
}
function drawBench(ctx: CanvasRenderingContext2D, detail: boolean) {
  ctx.strokeStyle = SURFACE.woodEdge;
  rect(ctx, FULL_RECT_RATIO, SURFACE.wood, true);
  if (!detail) return;
  for (const slat of BENCH_SLATS_RATIO) rect(ctx, slat, SURFACE.woodLight);
}
function drawMonitor(ctx: CanvasRenderingContext2D, detail: boolean) {
  rect(ctx, FULL_RECT_RATIO, SURFACE.monitor);
  if (!detail) return;
  rect(ctx, MONITOR_SCREEN_RATIO, SURFACE.screen);
  rect(ctx, MONITOR_STAND_RATIO, SURFACE.monitor);
  rect(ctx, SCREEN_REFLECTION_RATIO, SURFACE.screenLight);
}
function drawStorage(ctx: CanvasRenderingContext2D, detail: boolean) {
  ctx.strokeStyle = SURFACE.woodEdge;
  rect(ctx, FULL_RECT_RATIO, SURFACE.wood, true);
  if (!detail) return;
  rect(ctx, STORAGE_PANEL_RATIO, SURFACE.woodLight);
  rect(ctx, STORAGE_HANDLE_RATIO, SURFACE.woodEdge);
}
function drawBookcase(ctx: CanvasRenderingContext2D, detail: boolean) {
  drawStorage(ctx, false);
  if (!detail) return;
  rect(ctx, STORAGE_INSET_RATIO, SURFACE.woodEdge);
  SURFACE.books.forEach((color, index) => {
    rect(ctx, [BOOK_START_X_RATIO + index * BOOK_STEP_X_RATIO, BOOK_TOP_Y_RATIO, BOOK_WIDTH_RATIO, BOOK_DEPTH_RATIO], color);
  });
}
function drawFoliage(ctx: CanvasRenderingContext2D, detail: boolean, plant: boolean) {
  if (plant) {
    circle(ctx, 0, 0, POT_RADIUS_RATIO, SURFACE.pot);
    circle(ctx, 0, 0, SOIL_RADIUS_RATIO, SURFACE.soil);
  } else circle(ctx, 0, 0, CANOPY_RADIUS_RATIO, SURFACE.leafDark);
  if (!detail) {
    circle(ctx, 0, 0, SOIL_RADIUS_RATIO, SURFACE.leaf);
    return;
  }
  LEAF_CENTERS_RATIO.forEach(([x, y], index) => circle(ctx, x, y, LEAF_RADIUS_RATIO, LEAF_COLORS[index]));
}
const PROP_DRAWERS: Record<Exclude<Map2dPropKind, "fallback">, (ctx: CanvasRenderingContext2D, detail: boolean) => void> = {
  table: drawTable, bench: drawBench, monitor: drawMonitor, storage: drawStorage, bookcase: drawBookcase,
  chair: (ctx, detail) => drawSeat(ctx, detail, false),
  sofa: (ctx, detail) => drawSeat(ctx, detail, true),
  plant: (ctx, detail) => drawFoliage(ctx, detail, true),
  tree: (ctx, detail) => drawFoliage(ctx, detail, false),
};
function drawFallback(ctx: CanvasRenderingContext2D, prop: RoomLayoutProp, widthPx: number, depthPx: number) {
  const definition = PROP_DEFINITIONS.get(prop.asset);
  const image = propPreviewImages.get(definition);
  if (hasTopdownPropImage(definition) && image) {
    drawMap2dPropImage(ctx, image, widthPx, depthPx);
    return;
  }
  const style = map2dPropStyle(definition?.group ?? "", prop.asset);
  ctx.fillStyle = style.color;
  ctx.strokeStyle = MAP2D_DETAIL_PALETTE.border;
  ctx.beginPath();
  if (style.circle) ctx.arc(0, 0, Math.min(widthPx, depthPx) * HALF_RATIO, 0, FULL_CIRCLE_RAD);
  else ctx.rect(-widthPx * HALF_RATIO, -depthPx * HALF_RATIO, widthPx, depthPx);
  ctx.fill(); ctx.stroke();
  if (!image) return;
  drawMap2dPropImage(ctx, image, widthPx, depthPx);
}
function drawInteractionBadge(ctx: CanvasRenderingContext2D, screenX: number, screenY: number, widthPx: number, depthPx: number) {
  const offsetPx = Math.min(INTERACTION_BADGE_OFFSET_MAX_PX, Math.max(widthPx, depthPx) * INTERACTION_BADGE_OFFSET_RATIO);
  const xPx = screenX + offsetPx;
  const yPx = screenY - offsetPx;
  ctx.save();
  circle(ctx, xPx, yPx, INTERACTION_BADGE_RADIUS_PX, INTERACTION_BADGE_BACKGROUND);
  ctx.fillStyle = INTERACTION_BADGE_INK;
  ctx.font = `600 ${INTERACTION_FONT_PX}px system-ui`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(INTERACTION_GLYPH, xPx, yPx);
  ctx.restore();
}
/** Local normalized shapes retain the authoritative saved footprint and rotation. */
export function drawMap2dProp(ctx: CanvasRenderingContext2D, p: Map2dProjection, prop: RoomLayoutProp): void {
  const screen = worldToScreen(p, prop);
  const widthPx = prop.width * p.pxPerM;
  const depthPx = prop.depth * p.pxPerM;
  const kind = map2dPropKind(prop.asset);
  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(-prop.rotation);
  ctx.lineWidth = OUTLINE_WIDTH_PX;
  const definition = PROP_DEFINITIONS.get(prop.asset);
  const topdownImage = hasTopdownPropImage(definition) ? propPreviewImages.get(definition) : null;
  if (topdownImage) {
    drawMap2dPropImage(ctx, topdownImage, widthPx, depthPx);
  } else if (kind === "fallback") drawFallback(ctx, prop, widthPx, depthPx);
  else {
    ctx.scale(widthPx, depthPx);
    ctx.lineWidth = OUTLINE_WIDTH_PX / Math.min(widthPx, depthPx);
    ctx.save(); ctx.translate(SHADOW_OFFSET_RATIO, SHADOW_OFFSET_RATIO);
    if (kind === "plant" || kind === "tree") circle(ctx, 0, 0, CANOPY_RADIUS_RATIO, SURFACE.shadow);
    else rect(ctx, FULL_RECT_RATIO, SURFACE.shadow);
    ctx.restore();
    PROP_DRAWERS[kind](ctx, map2dPropDetailVisible(widthPx, depthPx));
  }
  ctx.restore();
  if (prop.interaction) drawInteractionBadge(ctx, screen.x, screen.y, widthPx, depthPx);
}
