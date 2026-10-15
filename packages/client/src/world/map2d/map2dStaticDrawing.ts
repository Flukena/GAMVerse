import { type RoomLayout, type RoomLayoutZone, type RoomLayoutRoadway } from "@gammyverse/shared";
import { MAP2D_COLORS } from "./constants";
import { worldToScreen, type Map2dProjection } from "./map2dProjection";
import { MAP2D_DETAIL_PALETTE } from "./map2dStaticDetail";
import { Map2dSurfaces } from "./map2dSurfaceDrawing";
import { drawMap2dWalls } from "./map2dWallDrawing";
import { drawMap2dProp } from "./map2dPropDrawing";

const OUTLINE_WIDTH_PX = 1;
const ROAD_DASH_LENGTH_M = 2;
const ROAD_DASH_GAP_M = 1;
const ROAD_CURB_WIDTH_M = 0.12;
const ROAD_CURB_MIN_WIDTH_PX = 1;
const ROAD_CURB_COLOR = "#9ea9a4";
const ZONE_EDGE_COLOR = "rgba(84, 109, 106, 0.22)";

function drawRoad(ctx: CanvasRenderingContext2D, p: Map2dProjection, road: RoomLayoutRoadway): void {
  const screen = worldToScreen(p, road);
  const widthPx = road.width * p.pxPerM;
  const depthPx = road.depth * p.pxPerM;
  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.fillStyle = MAP2D_DETAIL_PALETTE.asphalt;
  ctx.fillRect(-widthPx / 2, -depthPx / 2, widthPx, depthPx);
  ctx.strokeStyle = ROAD_CURB_COLOR;
  ctx.lineWidth = Math.max(ROAD_CURB_MIN_WIDTH_PX, ROAD_CURB_WIDTH_M * p.pxPerM);
  ctx.strokeRect(-widthPx / 2, -depthPx / 2, widthPx, depthPx);
  if (road.kind === "major") {
    const horizontal = widthPx >= depthPx;
    ctx.strokeStyle = MAP2D_DETAIL_PALETTE.roadLine;
    ctx.lineWidth = OUTLINE_WIDTH_PX;
    ctx.setLineDash([ROAD_DASH_LENGTH_M * p.pxPerM, ROAD_DASH_GAP_M * p.pxPerM]);
    ctx.beginPath();
    ctx.moveTo(horizontal ? -widthPx / 2 : 0, horizontal ? 0 : -depthPx / 2);
    ctx.lineTo(horizontal ? widthPx / 2 : 0, horizontal ? 0 : depthPx / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawZone(ctx: CanvasRenderingContext2D, p: Map2dProjection, zone: RoomLayoutZone, surfaces: Map2dSurfaces): void {
  const screen = worldToScreen(p, zone);
  const widthPx = zone.width * p.pxPerM;
  const depthPx = zone.depth * p.pxPerM;
  ctx.save();
  ctx.translate(screen.x, screen.y);
  surfaces.fill(widthPx, depthPx, zone.kind);
  ctx.strokeStyle = ZONE_EDGE_COLOR;
  ctx.lineWidth = OUTLINE_WIDTH_PX;
  ctx.strokeRect(-widthPx / 2, -depthPx / 2, widthPx, depthPx);
  ctx.restore();
}

export function drawMap2dStaticDetail(ctx: CanvasRenderingContext2D, p: Map2dProjection, layout: RoomLayout): void {
  const surfaces = new Map2dSurfaces(ctx, p.pxPerM);
  for (const road of layout.roadways ?? []) drawRoad(ctx, p, road);
  for (const zone of layout.zones) drawZone(ctx, p, zone, surfaces);
  for (const prop of layout.props) drawMap2dProp(ctx, p, prop);
  drawMap2dWalls(ctx, p, layout);
}
