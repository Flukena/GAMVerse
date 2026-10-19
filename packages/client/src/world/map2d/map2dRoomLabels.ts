import type { RoomLayoutZone } from "@gammyverse/shared";
import { MAP2D_COLORS } from "./constants";
import { worldToScreen, type Map2dProjection } from "./map2dProjection";
import { abbreviateRoomName } from "../roomLabel";
const ROOM_LABEL_FONT_PX = 10;
const ROOM_LABEL_TEXT_OPACITY = 0.4;
const ROOM_LABEL_HORIZONTAL_PADDING_PX = 4;
const ROOM_LABEL_VERTICAL_PADDING_PX = 4;
const ROOM_LABEL_ZONE_INSET_PX = 2;
const ROOM_LABEL_HEIGHT_PX = ROOM_LABEL_FONT_PX + ROOM_LABEL_VERTICAL_PADDING_PX * 2;
const ROOM_LABEL_RADIUS_PX = 8;
const ROOM_LABEL_BACKGROUND_COLOR = "rgba(255,253,247,0.94)";
export function drawMap2dRoomLabels(ctx: CanvasRenderingContext2D, p: Map2dProjection, zones: readonly RoomLayoutZone[]): void {
  ctx.save();
  ctx.font = `600 ${ROOM_LABEL_FONT_PX}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const zone of zones) {
    // Private desk zones display their current owner, while public room labels
    // continue using the compact map abbreviation.
    const label = zone.kind === "private" && zone.ownerUsername?.trim()
      ? zone.ownerUsername.trim()
      : abbreviateRoomName(zone.name);
    const point = worldToScreen(p, zone);
    const widthPx = ctx.measureText(label).width + ROOM_LABEL_HORIZONTAL_PADDING_PX * 2;
    const topPx = point.y - zone.depth * p.pxPerM / 2 + ROOM_LABEL_ZONE_INSET_PX;
    ctx.fillStyle = ROOM_LABEL_BACKGROUND_COLOR;
    ctx.beginPath();
    ctx.roundRect(point.x - widthPx / 2, topPx, widthPx, ROOM_LABEL_HEIGHT_PX, ROOM_LABEL_RADIUS_PX);
    ctx.fill();
    ctx.fillStyle = MAP2D_COLORS.text;
    ctx.globalAlpha = ROOM_LABEL_TEXT_OPACITY;
    ctx.fillText(label, point.x, topPx + ROOM_LABEL_HEIGHT_PX / 2);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
