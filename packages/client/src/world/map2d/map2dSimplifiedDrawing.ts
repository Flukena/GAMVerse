import type { RoomLayout, RoomLayoutProp } from "@gammyverse/shared";
import { MAP2D_COLORS } from "./constants";
import { worldToScreen, type Map2dProjection } from "./map2dProjection";
import { drawMap2dWalls } from "./map2dWallDrawing";
const PROP_OUTLINE_WIDTH_PX = 1;
function drawProp(ctx: CanvasRenderingContext2D, p: Map2dProjection, prop: RoomLayoutProp): void {
  const point = worldToScreen(p, prop);
  const widthPx = prop.width * p.pxPerM;
  const depthPx = prop.depth * p.pxPerM;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(-prop.rotation);
  ctx.fillStyle = MAP2D_COLORS.prop;
  ctx.strokeStyle = MAP2D_COLORS.wall;
  ctx.lineWidth = PROP_OUTLINE_WIDTH_PX;
  ctx.fillRect(-widthPx / 2, -depthPx / 2, widthPx, depthPx);
  ctx.strokeRect(-widthPx / 2, -depthPx / 2, widthPx, depthPx);
  ctx.restore();
}
export function drawMap2dSimplified(ctx: CanvasRenderingContext2D, p: Map2dProjection, layout: RoomLayout): void {
  for (const road of layout.roadways ?? []) {
    const point = worldToScreen(p, road);
    ctx.fillStyle = MAP2D_COLORS.road;
    ctx.fillRect(point.x - road.width * p.pxPerM / 2, point.y - road.depth * p.pxPerM / 2,
      road.width * p.pxPerM, road.depth * p.pxPerM);
  }
  for (const zone of layout.zones) {
    const point = worldToScreen(p, zone);
    ctx.fillStyle = MAP2D_COLORS.zone;
    ctx.fillRect(point.x - zone.width * p.pxPerM / 2, point.y - zone.depth * p.pxPerM / 2,
      zone.width * p.pxPerM, zone.depth * p.pxPerM);
  }
  for (const prop of layout.props) drawProp(ctx, p, prop);
  drawMap2dWalls(ctx, p, layout);
}
