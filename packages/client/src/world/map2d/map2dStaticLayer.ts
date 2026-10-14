import { ROOM_PROP_CATALOG, type RoomLayout } from "@gammyverse/shared";
import {
  MAP2D_BITMAP_MAX_EDGE_PX,
  MAP2D_COLORS,
  MAP2D_FONT_PX,
  MAP2D_SCALE_BUCKETS_PER_UNIT,
} from "./constants";
import { worldToScreen, type Map2dProjection } from "./map2dProjection";
const HASH_OFFSET = 2166136261;
const HASH_MULTIPLIER = 16777619;
const PROP_GROUP_COLORS = ["#c0bd9e", "#adc6bf", "#b7bed6", "#d1b1ad"];
export function map2dStaticCacheKey(
  layout: RoomLayout | null,
  configVersion: number,
  pxPerM: number,
): string {
  let hash = HASH_OFFSET;
  for (const character of JSON.stringify(layout))
    hash = Math.imul(hash ^ character.charCodeAt(0), HASH_MULTIPLIER);
  return `${hash >>> 0}:${configVersion}:${Math.round(pxPerM * MAP2D_SCALE_BUCKETS_PER_UNIT)}`;
}
function drawRect(
  ctx: CanvasRenderingContext2D,
  p: Map2dProjection,
  item: { x: number; z: number; width: number; depth: number },
  color: string,
  rotation = 0,
) {
  const screen = worldToScreen(p, item);
  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(-rotation);
  ctx.fillStyle = color;
  ctx.fillRect(
    (-item.width * p.pxPerM) / 2,
    (-item.depth * p.pxPerM) / 2,
    item.width * p.pxPerM,
    item.depth * p.pxPerM,
  );
  ctx.restore();
}
function drawProps(
  ctx: CanvasRenderingContext2D,
  p: Map2dProjection,
  layout: RoomLayout,
) {
  for (const prop of layout.props) {
    const definition = ROOM_PROP_CATALOG.find(
      (item) => item.asset === prop.asset,
    );
    const group = definition?.group ?? "";
    const groupIndex =
      [...group].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
      PROP_GROUP_COLORS.length;
    drawRect(
      ctx,
      p,
      prop,
      PROP_GROUP_COLORS[groupIndex] ?? MAP2D_COLORS.prop,
      prop.rotation,
    );
    const glyph = prop.interaction
      ? "↗"
      : definition?.vehicleId
        ? "▰"
        : definition?.interaction === "sit"
          ? "▱"
          : "";
    if (!glyph) continue;
    const screen = worldToScreen(p, prop);
    ctx.fillStyle = MAP2D_COLORS.text;
    ctx.font = `${MAP2D_FONT_PX}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(glyph, screen.x, screen.y);
  }
}
function drawWalls(
  ctx: CanvasRenderingContext2D,
  p: Map2dProjection,
  layout: RoomLayout,
) {
  for (const wall of layout.walls) {
    drawRect(
      ctx,
      p,
      {
        ...wall,
        width: wall.axis === "horizontal" ? wall.length : wall.thickness,
        depth: wall.axis === "vertical" ? wall.length : wall.thickness,
      },
      wall.color ?? MAP2D_COLORS.wall,
    );
    for (const door of layout.doors.filter((item) => item.wallId === wall.id)) {
      const position = {
        x: wall.x + (wall.axis === "horizontal" ? door.offset : 0),
        z: wall.z + (wall.axis === "vertical" ? door.offset : 0),
      };
      drawRect(
        ctx,
        p,
        {
          ...position,
          width: wall.axis === "horizontal" ? door.width : wall.thickness,
          depth: wall.axis === "vertical" ? door.width : wall.thickness,
        },
        door.kind === "opening" ? MAP2D_COLORS.floor : MAP2D_COLORS.door,
      );
    }
  }
}
export class Map2dStaticLayer {
  readonly canvas: HTMLCanvasElement;
  private cacheKey = "";
  private scalePxPerM = 0;
  private previousLayout: RoomLayout | null | undefined;
  private previousInputs = "";
  constructor() {
    this.canvas = document.createElement("canvas");
  }
  update(
    layout: RoomLayout | null,
    widthM: number,
    depthM: number,
    configVersion: number,
    pxPerM: number,
  ): void {
    const inputs = `${configVersion}:${Math.round(pxPerM * MAP2D_SCALE_BUCKETS_PER_UNIT)}:${widthM}:${depthM}`;
    if (layout === this.previousLayout && inputs === this.previousInputs)
      return;
    this.previousLayout = layout;
    this.previousInputs = inputs;
    const key = `${map2dStaticCacheKey(layout, configVersion, pxPerM)}:${widthM}:${depthM}`;
    if (key === this.cacheKey) return;
    this.cacheKey = key;
    this.scalePxPerM = Math.min(
      pxPerM,
      MAP2D_BITMAP_MAX_EDGE_PX / Math.max(widthM, depthM),
    );
    this.canvas.width = Math.max(1, Math.ceil(widthM * this.scalePxPerM));
    this.canvas.height = Math.max(1, Math.ceil(depthM * this.scalePxPerM));
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const p = {
      center: { x: 0, z: 0 },
      pxPerM: this.scalePxPerM,
      widthPx: this.canvas.width,
      heightPx: this.canvas.height,
      dpr: 1,
    };
    ctx.fillStyle = MAP2D_COLORS.floor;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!layout) return;
    for (const road of layout.roadways ?? [])
      drawRect(ctx, p, road, MAP2D_COLORS.road);
    for (const zone of layout.zones)
      drawRect(ctx, p, zone, zone.color || MAP2D_COLORS.zone);
    drawWalls(ctx, p, layout);
    drawProps(ctx, p, layout);
  }
  blit(ctx: CanvasRenderingContext2D, p: Map2dProjection): void {
    const factor = p.pxPerM / this.scalePxPerM;
    const left =
      p.widthPx / 2 - p.center.x * p.pxPerM - (this.canvas.width * factor) / 2;
    const top =
      p.heightPx / 2 -
      p.center.z * p.pxPerM -
      (this.canvas.height * factor) / 2;
    ctx.drawImage(
      this.canvas,
      left,
      top,
      this.canvas.width * factor,
      this.canvas.height * factor,
    );
  }
  dispose(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
