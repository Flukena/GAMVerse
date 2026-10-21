import type { RoomLayoutZone } from "@gammyverse/shared";
import { zoneOccupantRows, type ZoneOccupant } from "../zoneVisibility";
import { worldToScreen, type Map2dProjection } from "./map2dProjection";
import { WALL_CAP_COLOR } from "./map2dWallDrawing";
const OCCUPANT_FONT_PX = 8;
const OCCUPANT_LINE_HEIGHT_PX = 16;
const OCCUPANT_CARD_PADDING_X_PX = 8;
const OCCUPANT_CARD_PADDING_Y_PX = 4;
const OCCUPANT_STATUS_RADIUS_PX = 4;
const OCCUPANT_STATUS_GAP_PX = 12;
const OCCUPANT_CARD_RADIUS_PX = 6;
const OCCUPANT_CARD_COLOR = "rgba(255,253,247,0.94)";
export function drawMap2dZoneRoofs(ctx: CanvasRenderingContext2D, p: Map2dProjection, zones: readonly RoomLayoutZone[], players: Iterable<ZoneOccupant>): void {
  ctx.save();
  ctx.font = `600 ${OCCUPANT_FONT_PX}px system-ui`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const occupants = [...players];
  for (const zone of zones) {
    const point = worldToScreen(p, zone);
    ctx.fillStyle = WALL_CAP_COLOR;
    ctx.fillRect(point.x - zone.width * p.pxPerM / 2, point.y - zone.depth * p.pxPerM / 2, zone.width * p.pxPerM, zone.depth * p.pxPerM);
    const rows = zoneOccupantRows(zone, occupants);
    if (!rows.length) continue;
    const widthPx = Math.max(...rows.map(row => ctx.measureText(row.name).width)) + OCCUPANT_CARD_PADDING_X_PX * 2 + OCCUPANT_STATUS_GAP_PX + OCCUPANT_STATUS_RADIUS_PX * 2;
    const heightPx = rows.length * OCCUPANT_LINE_HEIGHT_PX + OCCUPANT_CARD_PADDING_Y_PX * 2;
    const leftPx = point.x - widthPx / 2;
    const topPx = point.y - heightPx / 2;
    ctx.fillStyle = OCCUPANT_CARD_COLOR;
    ctx.beginPath();
    ctx.roundRect(leftPx, topPx, widthPx, heightPx, OCCUPANT_CARD_RADIUS_PX);
    ctx.fill();
    rows.forEach(({ name, color }, index) => {
      const yPx = topPx + OCCUPANT_CARD_PADDING_Y_PX + (index + 0.5) * OCCUPANT_LINE_HEIGHT_PX;
      ctx.fillStyle = "#10212c";
      ctx.fillText(name, leftPx + OCCUPANT_CARD_PADDING_X_PX, yPx);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(leftPx + widthPx - OCCUPANT_CARD_PADDING_X_PX - OCCUPANT_STATUS_RADIUS_PX, yPx, OCCUPANT_STATUS_RADIUS_PX, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
}
