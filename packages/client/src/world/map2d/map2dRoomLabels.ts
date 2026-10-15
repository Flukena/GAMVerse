import type { RoomLayoutZone } from "@gammyverse/shared";
import { MAP2D_COLORS } from "./constants";
import { worldToScreen, type Map2dProjection } from "./map2dProjection";
const ROOM_LABEL_FONT_PX = 12;
const ROOM_LABEL_PADDING_PX = 6;
const ROOM_LABEL_HEIGHT_PX = 24;
const ROOM_LABEL_RADIUS_PX = 8;
const ROOM_LABEL_BACKGROUND_COLOR = "rgba(255,253,247,0.94)";
export function drawMap2dRoomLabels(ctx: CanvasRenderingContext2D, p: Map2dProjection, zones: readonly RoomLayoutZone[]): void {
  ctx.save();
  ctx.font = `600 ${ROOM_LABEL_FONT_PX}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const zone of zones) {
    const point = worldToScreen(p, zone);
    const widthPx = ctx.measureText(zone.name).width + ROOM_LABEL_PADDING_PX * 2;
    const topPx = point.y - zone.depth * p.pxPerM / 2 + ROOM_LABEL_PADDING_PX;
    ctx.fillStyle = ROOM_LABEL_BACKGROUND_COLOR;
    ctx.beginPath();
    ctx.roundRect(point.x - widthPx / 2, topPx, widthPx, ROOM_LABEL_HEIGHT_PX, ROOM_LABEL_RADIUS_PX);
    ctx.fill();
    ctx.fillStyle = MAP2D_COLORS.text;
    ctx.fillText(zone.name, point.x, topPx + ROOM_LABEL_HEIGHT_PX / 2);
  }
  ctx.restore();
}
