import { ROOM_PROP_CATALOG, type RoomLayout, type RoomLayoutZone, type RoomLayoutRoadway, type RoomLayoutWall, type RoomLayoutDoor } from "@gammyverse/shared";
import { MAP2D_COLORS, MAP2D_FONT_PX } from "./constants";
import { worldToScreen, type Map2dProjection } from "./map2dProjection";
import { fitPropIconRect, map2dGridVisible, map2dZoneLabelFontPx, map2dPropStyle, map2dWallThicknessPx, map2dWallFootprint, map2dDoorFootprint, MAP2D_DETAIL_PALETTE, MAP2D_GRID_SPACING_M } from "./map2dStaticDetail";
import { propPreviewImages } from "./propPreviewImages";

const MAP2D_OUTLINE_WIDTH_PX = 1;
const MAP2D_ROAD_DASH_LENGTH_M = 2;
const MAP2D_ROAD_DASH_GAP_M = 1;
const MAP2D_ROAD_LINE_WIDTH_PX = 1;
const MAP2D_ZONE_LABEL_PADDING_PX = 6;
const MAP2D_FULL_CIRCLE_RAD = Math.PI * 2;
const PROP_DEFINITIONS = new Map(ROOM_PROP_CATALOG.map((item) => [item.asset, item]));
type Footprint = { x: number; z: number; width: number; depth: number };
function localFootprint(ctx: CanvasRenderingContext2D, p: Map2dProjection, item: Footprint, rotation = 0) {
  const screen = worldToScreen(p, item);
  ctx.translate(screen.x, screen.y);
  ctx.rotate(-rotation);
  return { width: item.width * p.pxPerM, depth: item.depth * p.pxPerM };
}
function fillRect(ctx: CanvasRenderingContext2D, p: Map2dProjection, item: Footprint, color: string) {
  ctx.save();
  const size = localFootprint(ctx, p, item);
  ctx.fillStyle = color;
  ctx.fillRect(-size.width / 2, -size.depth / 2, size.width, size.depth);
  ctx.restore();
}
function drawRoad(ctx: CanvasRenderingContext2D, p: Map2dProjection, road: RoomLayoutRoadway) {
  fillRect(ctx, p, road, MAP2D_DETAIL_PALETTE.asphalt);
  if (road.kind !== "major") return;
  ctx.save();
  const size = localFootprint(ctx, p, road);
  const horizontal = size.width >= size.depth;
  ctx.strokeStyle = MAP2D_DETAIL_PALETTE.roadLine;
  ctx.lineWidth = MAP2D_ROAD_LINE_WIDTH_PX;
  ctx.setLineDash([MAP2D_ROAD_DASH_LENGTH_M * p.pxPerM, MAP2D_ROAD_DASH_GAP_M * p.pxPerM]);
  ctx.beginPath();
  ctx.moveTo(horizontal ? -size.width / 2 : 0, horizontal ? 0 : -size.depth / 2);
  ctx.lineTo(horizontal ? size.width / 2 : 0, horizontal ? 0 : size.depth / 2);
  ctx.stroke();
  ctx.restore();
}
function drawGrid(ctx: CanvasRenderingContext2D, p: Map2dProjection, widthPx: number, depthPx: number) {
  if (!map2dGridVisible(p.pxPerM)) return;
  const stepPx = MAP2D_GRID_SPACING_M * p.pxPerM;
  ctx.strokeStyle = MAP2D_DETAIL_PALETTE.grid;
  ctx.lineWidth = MAP2D_OUTLINE_WIDTH_PX;
  ctx.beginPath();
  for (let x = -widthPx / 2 + stepPx; x < widthPx / 2; x += stepPx) {
    ctx.moveTo(x, -depthPx / 2); ctx.lineTo(x, depthPx / 2);
  }
  for (let y = -depthPx / 2 + stepPx; y < depthPx / 2; y += stepPx) {
    ctx.moveTo(-widthPx / 2, y); ctx.lineTo(widthPx / 2, y);
  }
  ctx.stroke();
}
function drawZone(ctx: CanvasRenderingContext2D, p: Map2dProjection, zone: RoomLayoutZone) {
  ctx.save();
  const size = localFootprint(ctx, p, zone);
  ctx.fillStyle = MAP2D_DETAIL_PALETTE.floor;
  ctx.fillRect(-size.width / 2, -size.depth / 2, size.width, size.depth);
  ctx.fillStyle = MAP2D_DETAIL_PALETTE.zone[zone.kind];
  ctx.fillRect(-size.width / 2, -size.depth / 2, size.width, size.depth);
  drawGrid(ctx, p, size.width, size.depth);
  ctx.strokeStyle = MAP2D_DETAIL_PALETTE.border;
  ctx.lineWidth = MAP2D_OUTLINE_WIDTH_PX;
  ctx.strokeRect(-size.width / 2, -size.depth / 2, size.width, size.depth);
  ctx.restore();
}
function drawZoneLabel(ctx: CanvasRenderingContext2D, p: Map2dProjection, zone: RoomLayoutZone) {
  const fontPx = map2dZoneLabelFontPx(p.pxPerM);
  const maxWidthPx = zone.width * p.pxPerM - MAP2D_ZONE_LABEL_PADDING_PX * 2;
  if (!fontPx || maxWidthPx < fontPx || zone.depth * p.pxPerM < fontPx) return;
  const screen = worldToScreen(p, zone);
  ctx.save();
  ctx.font = `600 ${fontPx}px system-ui`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.strokeStyle = MAP2D_COLORS.white;
  ctx.lineWidth = MAP2D_OUTLINE_WIDTH_PX * 2;
  ctx.strokeText(zone.name, screen.x, screen.y, maxWidthPx);
  ctx.fillStyle = MAP2D_COLORS.text;
  ctx.fillText(zone.name, screen.x, screen.y, maxWidthPx);
  ctx.restore();
}
function drawProp(ctx: CanvasRenderingContext2D, p: Map2dProjection, prop: RoomLayout["props"][number]) {
  const definition = PROP_DEFINITIONS.get(prop.asset);
  const style = map2dPropStyle(definition?.group ?? "", prop.asset);
  const image = propPreviewImages.get(definition);
  ctx.save();
  const size = localFootprint(ctx, p, prop, prop.rotation);
  ctx.fillStyle = style.color; ctx.strokeStyle = MAP2D_DETAIL_PALETTE.border;
  ctx.lineWidth = MAP2D_OUTLINE_WIDTH_PX;
  ctx.beginPath();
  if (style.circle) ctx.arc(0, 0, Math.min(size.width, size.depth) / 2, 0, MAP2D_FULL_CIRCLE_RAD);
  else ctx.rect(-size.width / 2, -size.depth / 2, size.width, size.depth);
  ctx.fill(); ctx.stroke();
  if (image) {
    const rect = fitPropIconRect(image.naturalWidth, image.naturalHeight, size.width, size.depth);
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  }
  ctx.restore();
  const glyph = prop.interaction ? "↗" : definition?.vehicleId ? "▰" : definition?.interaction === "sit" ? "▱" : "";
  if (!glyph) return;
  const screen = worldToScreen(p, prop);
  ctx.fillStyle = MAP2D_COLORS.text; ctx.font = `${MAP2D_FONT_PX}px system-ui`;
  ctx.textAlign = "center"; ctx.fillText(glyph, screen.x, screen.y);
}
function drawDoor(ctx: CanvasRenderingContext2D, p: Map2dProjection, wall: RoomLayoutWall, door: RoomLayoutDoor) {
  const thicknessM = map2dWallThicknessPx(wall.thickness, p.pxPerM) / p.pxPerM;
  fillRect(ctx, p, map2dDoorFootprint(wall, door, thicknessM), MAP2D_DETAIL_PALETTE.floor);
  if (door.kind === "opening") return;
  const markThicknessM = MAP2D_OUTLINE_WIDTH_PX / p.pxPerM;
  fillRect(ctx, p, map2dDoorFootprint(wall, door, markThicknessM), MAP2D_DETAIL_PALETTE.door);
}
function drawWall(ctx: CanvasRenderingContext2D, p: Map2dProjection, wall: RoomLayoutWall, doors: readonly RoomLayoutDoor[]) {
  fillRect(ctx, p, map2dWallFootprint(wall, p.pxPerM), MAP2D_DETAIL_PALETTE.wall);
  for (const door of doors) {
    if (door.wallId === wall.id) drawDoor(ctx, p, wall, door);
  }
}
function drawWalls(ctx: CanvasRenderingContext2D, p: Map2dProjection, layout: RoomLayout) {
  for (const wall of layout.walls) drawWall(ctx, p, wall, layout.doors);
}
export function drawMap2dStaticDetail(ctx: CanvasRenderingContext2D, p: Map2dProjection, layout: RoomLayout) {
  for (const road of layout.roadways ?? []) drawRoad(ctx, p, road);
  for (const zone of layout.zones) drawZone(ctx, p, zone);
  for (const prop of layout.props) drawProp(ctx, p, prop);
  drawWalls(ctx, p, layout);
  for (const zone of layout.zones) drawZoneLabel(ctx, p, zone);
}
