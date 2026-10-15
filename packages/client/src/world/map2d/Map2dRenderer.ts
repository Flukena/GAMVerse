import type { Map2dPresentation } from "./map2dPresentation";
import { drawMap2dRoomLabels } from "./map2dRoomLabels";
import type { RoomLayout } from "@gammyverse/shared";
import {
  MAP2D_COLORS,
  MAP2D_VIEW_STORAGE_KEY,
} from "./constants";
import { Map2dPlayerFrames } from "./map2dPlayerFrames";
import { Map2dFrameChanges, writeMap2dFollowProjection } from "./map2dFrameChanges";
import {
  drawMap2dDynamic,
  drawMap2dInteraction,
  drawMap2dDestination,
  type Map2dDecoration,
  type Map2dPlayer,
} from "./map2dDynamicLayer";
import { isMap2dDrag, pickMap2dPlayer } from "./map2dInput";
import { Map2dStaticLayer } from "./map2dStaticLayer";
import { AvatarPortraits } from "./avatarPortraits";
import {
  map2dWheelScale,
  screenToWorld,
  type Map2dPoint,
  type Map2dProjection,
  type ScreenPoint,
} from "./map2dProjection";
export interface Map2dListener {
  pan(center: Map2dPoint): void;
  zoom(pxPerM: number): void;
  zoomOverview(deltaYPx: number): void;
  walk(destination: Map2dPoint): void;
  selectPlayer(sessionId: string, screenX: number, screenY: number): void;
}
export type Map2dFrame = {
  presentation?: Map2dPresentation;
  visible: boolean;
  view: "2d" | "3d";
  layout: RoomLayout | null;
  widthM: number;
  depthM: number;
  configVersion: number;
  projection: Map2dProjection;
  players: ReadonlyMap<string, Map2dPlayer>;
  localId: string | null;
  speaking: ReadonlySet<string>;
  decorations: readonly Map2dDecoration[];
  nowMs: number;
  deltaS: number;
  destination?: Map2dPoint | null;
  following?: boolean;
};
export function readMap2dPreference(): boolean {
  try {
    return localStorage.getItem(MAP2D_VIEW_STORAGE_KEY) === "2d";
  } catch {
    return false;
  }
}
export function persistMap2dPreference(view: "2d" | "3d"): void {
  try {
    localStorage.setItem(MAP2D_VIEW_STORAGE_KEY, view);
  } catch {
    /* Storage-disabled devices keep the preference for this session. */
  }
}
export class Map2dRenderer {
  readonly staticLayer = new Map2dStaticLayer();
  private readonly portraits = new AvatarPortraits();
  private state: Map2dFrame | null = null;
  private readonly playerFrames = new Map2dPlayerFrames();
  private readonly changes = new Map2dFrameChanges();
  private readonly projection: Map2dProjection = { center: { x: 0, z: 0 }, pxPerM: 0, widthPx: 0, heightPx: 0, dpr: 1 };
  private pointer: {
    id: number;
    button: number;
    start: ScreenPoint;
    previous: ScreenPoint;
    dragged: boolean;
  } | null = null;
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly listener: Map2dListener,
  ) {
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "2D office map; M toggles view");
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
    canvas.addEventListener("lostpointercapture", this.pointerCancel);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    canvas.addEventListener("contextmenu", this.contextMenu);
  }
  private point(event: PointerEvent | WheelEvent): ScreenPoint {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private readonly pointerDown = (event: PointerEvent): void => {
    if ((event.button !== 0 && event.button !== 2) || this.pointer || !this.state?.visible) return;
    if (event.button === 2) event.preventDefault();
    this.canvas.focus();
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.point(event);
    this.pointer = {
      id: event.pointerId,
      button: event.button,
      start: point,
      previous: point,
      dragged: false,
    };
  };
  private readonly pointerMove = (event: PointerEvent): void => {
    const pointer = this.pointer;
    const state = this.state;
    if (!pointer || pointer.id !== event.pointerId || !state?.visible) return;
    const point = this.point(event);
    pointer.dragged ||= isMap2dDrag(pointer.start, point);
    if (pointer.dragged)
      this.listener.pan({
        x:
          this.projection.center.x -
          (point.x - pointer.previous.x) / this.projection.pxPerM,
        z:
          this.projection.center.z -
          (point.y - pointer.previous.y) / this.projection.pxPerM,
      });
    pointer.previous = point;
  };
  private readonly pointerUp = (event: PointerEvent): void => {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    this.pointer = null;
    if (pointer.button !== 0) return;
    const state = this.state;
    const point = this.point(event);
    if (pointer.dragged || isMap2dDrag(pointer.start, point) || !state?.visible) return;
    const playerId = pickMap2dPlayer(
      this.projection,
      this.playerFrames.players,
      point,
    );
    if (playerId) {
      this.listener.selectPlayer(playerId, event.clientX, event.clientY);
      return;
    }
    const world = screenToWorld(this.projection, point);
    if (
      Math.abs(world.x) <= state.widthM / 2 &&
      Math.abs(world.z) <= state.depthM / 2
    )
      this.listener.walk(world);
  };
  private readonly contextMenu = (event: MouseEvent): void => { event.preventDefault(); };
  private readonly pointerCancel = (event: PointerEvent): void => {
    if (this.pointer?.id === event.pointerId) this.pointer = null;
  };
  private readonly wheel = (event: WheelEvent): void => {
    const state = this.state;
    if (!state?.visible) return;
    event.preventDefault();
    if (state.view === "3d") {
      this.listener.zoomOverview(event.deltaY);
      return;
    }
    const point = this.point(event);
    const before = screenToWorld(this.projection, point);
    const scale = map2dWheelScale(this.projection.pxPerM, event.deltaY);
    this.listener.zoom(scale);
    const after = screenToWorld({ ...this.projection, pxPerM: scale }, point);
    this.listener.pan({
      x: this.projection.center.x + before.x - after.x,
      z: this.projection.center.z + before.z - after.z,
    });
  };
  private resizeCanvas(): void {
    const p = this.projection;
    const width = Math.round(p.widthPx * p.dpr);
    const height = Math.round(p.heightPx * p.dpr);
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.changes.invalidate();
  }
  frame(state: Map2dFrame): Map2dPoint | undefined {
    this.state = state;
    this.canvas.style.display = state.visible ? "block" : "none";
    if (!state.visible) {
      this.pointer = null;
      this.changes.invalidate();
      return;
    }
    const playersChanged = this.playerFrames.update(state.players, state.localId, state.deltaS);
    writeMap2dFollowProjection(this.projection, state.projection, Boolean(state.following),
      state.localId ? this.playerFrames.players.get(state.localId) : undefined);
    const p = this.projection;
    this.resizeCanvas();
    const sceneChanged = this.changes.update(state, p, this.staticLayer.revision, this.portraits.revision);
    if (playersChanged || sceneChanged) this.drawFrame(state);
    return p.center;
  }
  private drawFrame(state: Map2dFrame): void {
    const p = this.projection;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
    ctx.fillStyle = MAP2D_COLORS.outside;
    ctx.fillRect(0, 0, p.widthPx, p.heightPx);
    this.staticLayer.update(
      state.layout,
      state.widthM,
      state.depthM,
      state.configVersion,
      p.pxPerM,
      state.presentation,
    );
    this.staticLayer.blit(ctx, p);
    drawMap2dRoomLabels(ctx, p, state.layout?.zones ?? []);
    if (state.destination) drawMap2dDestination(ctx, p, state.destination);
    drawMap2dInteraction(
      ctx,
      p,
      state.layout?.props ?? [],
      state.localId ? this.playerFrames.players.get(state.localId) : undefined,
    );
    drawMap2dDynamic(
      ctx,
      p,
      this.playerFrames.players,
      state.localId,
      state.speaking,
      this.changes.activeDecorations,
      state.nowMs,
      this.portraits,
      state.presentation,
    );
  }
  dispose(): void {
    this.staticLayer.dispose();
    this.portraits.dispose();
    this.playerFrames.clear();
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointercancel", this.pointerCancel);
    this.canvas.removeEventListener("lostpointercapture", this.pointerCancel);
    this.canvas.removeEventListener("wheel", this.wheel);
    this.canvas.removeEventListener("contextmenu", this.contextMenu);
  }
}
