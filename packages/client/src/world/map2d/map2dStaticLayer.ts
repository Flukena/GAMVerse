import { CAMPUS_GRASS_COLOR, CAMPUS_STONE_COLOR } from "../zoneFloorColor";
import { type RoomLayout } from "@gammyverse/shared";
import {
  MAP2D_BITMAP_MAX_EDGE_PX,
  MAP2D_SCALE_BUCKETS_PER_UNIT,
} from "./constants";
import { type Map2dProjection } from "./map2dProjection";
import { drawMap2dStaticDetail } from "./map2dStaticDrawing";
import { Map2dSurfaces } from "./map2dSurfaceDrawing";
import { drawMap2dSimplified } from "./map2dSimplifiedDrawing";
import type { Map2dPresentation } from "./map2dPresentation";
import { propPreviewImages } from "./propPreviewImages";
const HASH_OFFSET = 2166136261;
const HASH_MULTIPLIER = 16777619;
export function map2dStaticCacheKey(
  layout: RoomLayout | null,
  configVersion: number,
  pxPerM: number,
  presentation: Map2dPresentation = "immersive",
): string {
  let hash = HASH_OFFSET;
  for (const character of JSON.stringify(layout))
    hash = Math.imul(hash ^ character.charCodeAt(0), HASH_MULTIPLIER);
  return `${presentation}:${hash >>> 0}:${configVersion}:${Math.round(pxPerM * MAP2D_SCALE_BUCKETS_PER_UNIT)}`;
}
export class Map2dStaticLayer {
  readonly canvas: HTMLCanvasElement;
  private presentation: Map2dPresentation = "immersive";
  private cacheKey = "";
  private scalePxPerM = 0;
  private previousLayout: RoomLayout | null | undefined;
  private previousInputs = "";
  private previousImageRevision = -1;
  private previousDimensions: { widthM: number; depthM: number; configVersion: number; pxPerM: number } | null = null;
  get revision(): number { return propPreviewImages.revision; }
  constructor() {
    this.canvas = document.createElement("canvas");
  }
  update(
    layout: RoomLayout | null,
    widthM: number,
    depthM: number,
    configVersion: number,
    pxPerM: number,
    presentation: Map2dPresentation = "immersive",
  ): void {
    const inputs = `${presentation}:${this.revision}:${configVersion}:${Math.round(pxPerM * MAP2D_SCALE_BUCKETS_PER_UNIT)}:${widthM}:${depthM}`;
    if (layout === this.previousLayout && inputs === this.previousInputs)
      return;
    this.presentation = presentation;
    this.previousLayout = layout;
    this.previousDimensions = { widthM, depthM, configVersion, pxPerM };
    this.previousImageRevision = this.revision;
    this.previousInputs = inputs;
    const key = `${this.revision}:${map2dStaticCacheKey(layout, configVersion, pxPerM, presentation)}:${widthM}:${depthM}`;
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
    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    if (presentation === "immersive") new Map2dSurfaces(ctx, this.scalePxPerM).fill(this.canvas.width, this.canvas.height, null, Boolean(layout?.roadways?.length));
    else { ctx.fillStyle = `#${(layout?.roadways?.length ? CAMPUS_GRASS_COLOR : CAMPUS_STONE_COLOR).toString(16)}`; ctx.fillRect(-this.canvas.width / 2, -this.canvas.height / 2, this.canvas.width, this.canvas.height); }
    ctx.restore();
    if (!layout) return;
    if (presentation === "simplified") drawMap2dSimplified(ctx, p, layout);
    else drawMap2dStaticDetail(ctx, p, layout);
  }
  blit(ctx: CanvasRenderingContext2D, p: Map2dProjection): void {
    const previous = this.previousDimensions;
    if (previous && this.previousImageRevision !== this.revision)
      this.update(this.previousLayout ?? null, previous.widthM, previous.depthM, previous.configVersion, previous.pxPerM, this.presentation);
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
