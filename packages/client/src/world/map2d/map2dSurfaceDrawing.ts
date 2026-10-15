import type { RoomLayoutZone } from "@gammyverse/shared";
import { map2dGridVisible } from "./map2dStaticDetail";
import { map2dSurfaceDetailVisible, map2dSurfaceStyle, type Map2dSurfaceMaterial, type Map2dSurfaceStyle } from "./map2dSurfaceStyle";

const PATTERN_SIZE_M = 2;
const PATTERN_MIN_SIZE_PX = 12;
const SEAM_WIDTH_PX = 0.7;
const WOOD_ROWS_COUNT = 4;
const GRASS_TUFT_WIDTH_RATIO = 0.06;
const GRASS_TUFT_HEIGHT_RATIO = 0.04;
const GRASS_TUFT_POSITIONS = [[0.18, 0.22], [0.7, 0.65], [0.38, 0.83]] as const;
const CARPET_STRIPE_WIDTH_RATIO = 0.25;
const TILE_ACCENT_INSET_RATIO = 0.08;
const WOOD_EVEN_JOINT_RATIO = 0.25;
const WOOD_ODD_JOINT_RATIO = 0.75;
const CARPET_WEAVE_WIDTH_RATIO = 0.025;

function drawWood(ctx: CanvasRenderingContext2D, sizePx: number, style: Map2dSurfaceStyle): void {
  const rowPx = sizePx / WOOD_ROWS_COUNT;
  ctx.fillStyle = style.accent;
  ctx.fillRect(0, 0, sizePx, rowPx);
  ctx.fillRect(0, rowPx * 2, sizePx, rowPx);
  ctx.beginPath();
  for (let row = 0; row < WOOD_ROWS_COUNT; row += 1) {
    const y = row * rowPx;
    const jointX = sizePx * (row % 2 === 0 ? WOOD_EVEN_JOINT_RATIO : WOOD_ODD_JOINT_RATIO);
    ctx.moveTo(0, y); ctx.lineTo(sizePx, y);
    ctx.moveTo(jointX, y); ctx.lineTo(jointX, y + rowPx);
  }
  ctx.stroke();
}

function drawTile(ctx: CanvasRenderingContext2D, sizePx: number, style: Map2dSurfaceStyle): void {
  const halfPx = sizePx / 2;
  const insetPx = sizePx * TILE_ACCENT_INSET_RATIO;
  ctx.fillStyle = style.accent;
  ctx.fillRect(insetPx, insetPx, halfPx - insetPx * 2, halfPx - insetPx * 2);
  ctx.fillRect(halfPx + insetPx, halfPx + insetPx, halfPx - insetPx * 2, halfPx - insetPx * 2);
  ctx.beginPath();
  ctx.rect(0, 0, sizePx, sizePx);
  ctx.moveTo(halfPx, 0); ctx.lineTo(halfPx, sizePx);
  ctx.moveTo(0, halfPx); ctx.lineTo(sizePx, halfPx);
  ctx.stroke();
}

function drawGrass(ctx: CanvasRenderingContext2D, sizePx: number, style: Map2dSurfaceStyle): void {
  ctx.strokeStyle = style.seam;
  ctx.beginPath();
  for (const [xRatio, yRatio] of GRASS_TUFT_POSITIONS) {
    const x = xRatio * sizePx;
    const y = yRatio * sizePx;
    ctx.moveTo(x - sizePx * GRASS_TUFT_WIDTH_RATIO, y);
    ctx.lineTo(x, y + sizePx * GRASS_TUFT_HEIGHT_RATIO);
    ctx.lineTo(x + sizePx * GRASS_TUFT_WIDTH_RATIO, y);
  }
  ctx.stroke();
}

function drawCarpet(ctx: CanvasRenderingContext2D, sizePx: number, style: Map2dSurfaceStyle): void {
  ctx.fillStyle = style.accent;
  const stripePx = sizePx * CARPET_STRIPE_WIDTH_RATIO;
  ctx.fillRect(0, 0, sizePx / 2, stripePx);
  ctx.fillRect(sizePx / 2, sizePx / 2, sizePx / 2, stripePx);
}

const PATTERN_DRAWERS = { wood: drawWood, tile: drawTile, grass: drawGrass, carpet: drawCarpet };

/** Patterns live only for one static bitmap rebuild, independent of the render loop. */
export class Map2dSurfaces {
  private readonly patterns = new Map<Map2dSurfaceMaterial, CanvasPattern | null>();
  constructor(private readonly ctx: CanvasRenderingContext2D, private readonly pxPerM: number) {}

  private pattern(style: Map2dSurfaceStyle): CanvasPattern | null {
    if (this.patterns.has(style.material)) return this.patterns.get(style.material) ?? null;
    const tile = document.createElement("canvas");
    tile.width = tile.height = Math.max(PATTERN_MIN_SIZE_PX, Math.round(this.pxPerM * PATTERN_SIZE_M));
    const ctx = tile.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = style.base;
    ctx.fillRect(0, 0, tile.width, tile.height);
    ctx.strokeStyle = style.seam;
    ctx.lineWidth = SEAM_WIDTH_PX;
    PATTERN_DRAWERS[style.material](ctx, tile.width, style);
    if (style.material === "carpet" && map2dGridVisible(this.pxPerM)) {
      ctx.fillStyle = style.seam;
      ctx.fillRect(0, 0, tile.width * CARPET_WEAVE_WIDTH_RATIO, tile.height);
    }
    const pattern = this.ctx.createPattern(tile, "repeat");
    this.patterns.set(style.material, pattern);
    return pattern;
  }

  fill(widthPx: number, depthPx: number, kind: RoomLayoutZone["kind"] | null, outdoor = false): void {
    const style = map2dSurfaceStyle(kind, outdoor);
    const detailed = map2dSurfaceDetailVisible(this.pxPerM);
    this.ctx.fillStyle = detailed ? this.pattern(style) ?? style.base : style.base;
    this.ctx.fillRect(-widthPx / 2, -depthPx / 2, widthPx, depthPx);
  }
}
