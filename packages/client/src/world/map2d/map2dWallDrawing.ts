import { roomWallSolidSegments, type RoomLayout, type RoomLayoutWall, type RoomLayoutDoor } from "@gammyverse/shared";
import { worldToScreen, type Map2dProjection } from "./map2dProjection";
import { map2dWallFootprint, map2dDoorFootprint, map2dWallThicknessPx } from "./map2dStaticDetail";

export const WALL_CAP_COLOR = "#e4e7e2";
const WALL_EDGE_COLOR = "#7e9190";
const WALL_SHADOW_COLOR = "rgba(36, 56, 55, 0.16)";
const WALL_SHADOW_OFFSET_PX = 3;
const WALL_EDGE_WIDTH_PX = 1;
const WALL_DETAIL_MIN_SCALE_PX_PER_M = 6;
const DOOR_THRESHOLD_COLOR = "#b98f5c";
const DOOR_THRESHOLD_WIDTH_PX = 2;
type SolidWallSpan = ReturnType<typeof roomWallSolidSegments>[number];

function drawWallSpan(ctx: CanvasRenderingContext2D, p: Map2dProjection, wall: RoomLayoutWall): void {
  const footprint = map2dWallFootprint(wall, p.pxPerM);
  const screen = worldToScreen(p, footprint);
  const widthPx = footprint.width * p.pxPerM;
  const depthPx = footprint.depth * p.pxPerM;
  const leftPx = screen.x - widthPx / 2;
  const topPx = screen.y - depthPx / 2;
  if (p.pxPerM >= WALL_DETAIL_MIN_SCALE_PX_PER_M) {
    const offsetX = wall.axis === "vertical" ? WALL_SHADOW_OFFSET_PX : 0;
    const offsetY = wall.axis === "horizontal" ? WALL_SHADOW_OFFSET_PX : 0;
    ctx.fillStyle = WALL_SHADOW_COLOR;
    ctx.fillRect(leftPx + offsetX, topPx + offsetY, widthPx, depthPx);
  }
  ctx.fillStyle = WALL_CAP_COLOR;
  ctx.fillRect(leftPx, topPx, widthPx, depthPx);
  ctx.strokeStyle = WALL_EDGE_COLOR;
  ctx.lineWidth = WALL_EDGE_WIDTH_PX;
  ctx.strokeRect(leftPx, topPx, widthPx, depthPx);
}

function drawDoorThreshold(ctx: CanvasRenderingContext2D, p: Map2dProjection, wall: RoomLayoutWall, door: RoomLayoutDoor): void {
  if (door.kind === "opening") return;
  const thicknessM = map2dWallThicknessPx(wall.thickness, p.pxPerM) / p.pxPerM;
  const footprint = map2dDoorFootprint(wall, door, thicknessM);
  const screen = worldToScreen(p, footprint);
  const widthPx = footprint.width * p.pxPerM;
  const depthPx = footprint.depth * p.pxPerM;
  const horizontal = wall.axis === "horizontal";
  ctx.strokeStyle = DOOR_THRESHOLD_COLOR;
  ctx.lineWidth = DOOR_THRESHOLD_WIDTH_PX;
  ctx.beginPath();
  ctx.moveTo(screen.x - (horizontal ? widthPx / 2 : 0), screen.y - (horizontal ? 0 : depthPx / 2));
  ctx.lineTo(screen.x + (horizontal ? widthPx / 2 : 0), screen.y + (horizontal ? 0 : depthPx / 2));
  ctx.stroke();
}

function segmentWall(wall: RoomLayoutWall, segment: SolidWallSpan): RoomLayoutWall {
  const midpointM = (segment.start + segment.end) / 2;
  return { ...wall, length: segment.end - segment.start,
    x: wall.x + (wall.axis === "horizontal" ? midpointM : 0),
    z: wall.z + (wall.axis === "vertical" ? midpointM : 0) };
}

function drawWall(ctx: CanvasRenderingContext2D, p: Map2dProjection, wall: RoomLayoutWall, doors: readonly RoomLayoutDoor[]): void {
  for (const segment of roomWallSolidSegments(wall, doors)) drawWallSpan(ctx, p, segmentWall(wall, segment));
  if (p.pxPerM < WALL_DETAIL_MIN_SCALE_PX_PER_M) return;
  for (const door of doors) if (door.wallId === wall.id) drawDoorThreshold(ctx, p, wall, door);
}

export function drawMap2dWalls(ctx: CanvasRenderingContext2D, p: Map2dProjection, layout: RoomLayout): void {
  ctx.save();
  for (const wall of layout.walls) drawWall(ctx, p, wall, layout.doors);
  ctx.restore();
}
