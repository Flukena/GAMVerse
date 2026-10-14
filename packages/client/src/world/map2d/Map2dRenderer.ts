import type { RoomLayout } from "@gammyverse/shared";
import {
  MAP2D_COLORS,
  MAP2D_DRAG_THRESHOLD_PX,
  MAP2D_TOGGLE_KEY_CODE,
  MAP2D_VIEW_STORAGE_KEY,
} from "./constants";
import {
  smoothAvatarPose,
  isPoseSettled,
  type AvatarPose,
} from "./avatarPoseSmoother";
import {
  drawMap2dDynamic,
  drawMap2dInteraction,
  drawMap2dDestination,
  type Map2dDecoration,
  type Map2dPlayer,
} from "./map2dDynamicLayer";
import { pickMap2dPlayer } from "./map2dInput";
import { Map2dStaticLayer } from "./map2dStaticLayer";
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
  toggle(): void;
}
export type Map2dFrame = {
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
  private state: Map2dFrame | null = null;
  private signature = "";
  private previousLayout: RoomLayout | null | undefined;
  private readonly renderedPlayers = new Map<string, Map2dPlayer>();
  private readonly poses = new Map<string, AvatarPose>();
  private pointer: {
    id: number;
    start: ScreenPoint;
    previous: ScreenPoint;
    dragged: boolean;
  } | null = null;
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly listener: Map2dListener,
  ) {
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "2D office map; V toggles view");
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    canvas.addEventListener("keydown", this.keyDown);
  }
  private point(event: PointerEvent | WheelEvent): ScreenPoint {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private readonly pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.state?.visible) return;
    this.canvas.focus();
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.point(event);
    this.pointer = {
      id: event.pointerId,
      start: point,
      previous: point,
      dragged: false,
    };
  };
  private readonly pointerMove = (event: PointerEvent): void => {
    const pointer = this.pointer;
    const state = this.state;
    if (!pointer || !state) return;
    const point = this.point(event);
    pointer.dragged ||=
      Math.hypot(point.x - pointer.start.x, point.y - pointer.start.y) >=
      MAP2D_DRAG_THRESHOLD_PX;
    if (pointer.dragged)
      this.listener.pan({
        x:
          state.projection.center.x -
          (point.x - pointer.previous.x) / state.projection.pxPerM,
        z:
          state.projection.center.z -
          (point.y - pointer.previous.y) / state.projection.pxPerM,
      });
    pointer.previous = point;
  };
  private readonly pointerUp = (event: PointerEvent): void => {
    const pointer = this.pointer;
    this.pointer = null;
    const state = this.state;
    if (!pointer || pointer.dragged || !state) return;
    const point = this.point(event);
    const playerId = pickMap2dPlayer(
      state.projection,
      this.renderedPlayers,
      point,
    );
    if (playerId) {
      this.listener.selectPlayer(playerId, event.clientX, event.clientY);
      return;
    }
    const world = screenToWorld(state.projection, point);
    if (
      Math.abs(world.x) <= state.widthM / 2 &&
      Math.abs(world.z) <= state.depthM / 2
    )
      this.listener.walk(world);
  };
  private readonly pointerCancel = (): void => {
    this.pointer = null;
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
    const before = screenToWorld(state.projection, point);
    const scale = map2dWheelScale(state.projection.pxPerM, event.deltaY);
    this.listener.zoom(scale);
    const after = screenToWorld({ ...state.projection, pxPerM: scale }, point);
    this.listener.pan({
      x: state.projection.center.x + before.x - after.x,
      z: state.projection.center.z + before.z - after.z,
    });
  };
  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.code === MAP2D_TOGGLE_KEY_CODE && !event.repeat) {
      event.preventDefault();
      this.listener.toggle();
    }
  };
  private smoothPlayers(state: Map2dFrame): {
    players: Map<string, Map2dPlayer>;
    settled: boolean;
  } {
    const players = new Map<string, Map2dPlayer>();
    let settled = true;
    for (const [id, target] of state.players) {
      const pose = smoothAvatarPose(
        this.poses.get(id) ?? target,
        target,
        state.deltaS,
        id === state.localId,
      );
      this.poses.set(id, pose);
      players.set(id, { ...target, ...pose });
      settled &&= isPoseSettled(pose, target);
    }
    for (const id of this.poses.keys())
      if (!players.has(id)) this.poses.delete(id);
    this.renderedPlayers.clear();
    for (const [id, player] of players) this.renderedPlayers.set(id, player);
    return { players, settled };
  }
  frame(state: Map2dFrame): void {
    this.state = state;
    this.canvas.style.display = state.visible ? "block" : "none";
    if (!state.visible) {
      this.signature = "";
      return;
    }
    if (state.layout !== this.previousLayout) {
      this.previousLayout = state.layout;
      this.signature = "";
    }
    const p = state.projection;
    const width = Math.round(p.widthPx * p.dpr);
    const height = Math.round(p.heightPx * p.dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.signature = "";
    }
    const smoothed = this.smoothPlayers(state);
    const activeDecorations = state.decorations.filter(
      (item) => item.expiresAtMs > state.nowMs,
    );
    const signature = JSON.stringify([
      p,
      state.configVersion,
      [...state.players],
      [...state.speaking],
      activeDecorations,
      state.destination,
    ]);
    if (
      signature === this.signature &&
      smoothed.settled &&
      activeDecorations.length === 0
    )
      return;
    this.signature = smoothed.settled ? signature : "";
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
    );
    this.staticLayer.blit(ctx, p);
    if (state.destination) drawMap2dDestination(ctx, p, state.destination);
    drawMap2dInteraction(
      ctx,
      p,
      state.layout?.props ?? [],
      state.localId ? smoothed.players.get(state.localId) : undefined,
    );
    drawMap2dDynamic(
      ctx,
      p,
      smoothed.players,
      state.localId,
      state.speaking,
      activeDecorations,
      state.nowMs,
    );
  }
  dispose(): void {
    this.staticLayer.dispose();
    this.poses.clear();
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointercancel", this.pointerCancel);
    this.canvas.removeEventListener("wheel", this.wheel);
    this.canvas.removeEventListener("keydown", this.keyDown);
  }
}
