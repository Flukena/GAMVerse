import { CAMERA } from "@gammyverse/shared";
import { MathUtils } from "three";
import { CAMPUS_2D_ZOOM_THRESHOLD_RATIO, CAMPUS_MAX_ZOOM_RATIO, CAMPUS_MIN_ZOOM_RATIO, DEFAULT_CAMPUS_ELEVATION_DEG, DEFAULT_TPP_ELEVATION_RAD, LIVE_OFFICE_FOCUS_DISTANCE_M, TPP_ELEVATION_MAX_DEG, TPP_ELEVATION_MIN_DEG } from "./constants";

import { MAP2D_DEFAULT_SCALE_PX_PER_M } from "../map2d/constants";
import { clampMap2dScale } from "../map2d/map2dProjection";

export type CameraMode = "tpp" | "fpp" | "free" | "map2d";
export type CameraState = {
  mode: CameraMode;
  view: "3d" | "2d";
  map2dScalePxPerM: number;
  following: boolean;
  /** Keep the third-person camera behind the player's facing direction. */
  followFacing: boolean;
  editing: boolean;
  campus: boolean;
  arrival: "awaiting-avatar" | "ready";
  /** On arrival, turn the camera behind the avatar; false keeps yaw while walking across a room edge. */
  alignBehind: boolean;
  distanceM: number;
  zoomRatio: number;
  elevationRad: number;
};
export type CameraEvent =
  | { type: "room-change"; campus: boolean; alignBehind: boolean; preserveFraming?: boolean }
  | { type: "avatar-ready" }
  | { type: "toggle-fpp" }
  | { type: "toggle-2d" }
  | { type: "set-view"; view: "3d" | "2d" }
  | { type: "map2d-scale"; pxPerM: number }
  | { type: "focus-character" }
  | { type: "set-camera-lock"; locked: boolean }
  | { type: "manual-drag" }
  | { type: "manual-rotate" }
  | { type: "walk-input" }
  | { type: "edit"; active: boolean }
  | { type: "zoom"; ratio: number; distanceM?: number }
  | { type: "distance"; distanceM: number; maxDistanceM?: number }
  | { type: "elevation"; radians: number };

export function createCameraState(campus: boolean, alignBehind = true): CameraState {
  return {
    mode: "tpp", view: "3d", map2dScalePxPerM: MAP2D_DEFAULT_SCALE_PX_PER_M, following: true, followFacing: true, editing: false, campus, arrival: "awaiting-avatar", alignBehind,
    distanceM: LIVE_OFFICE_FOCUS_DISTANCE_M, zoomRatio: CAMPUS_MAX_ZOOM_RATIO,
    elevationRad: campus ? MathUtils.degToRad(DEFAULT_CAMPUS_ELEVATION_DEG) : DEFAULT_TPP_ELEVATION_RAD,
  };
}

export function isBehindCharacterLocked(state: CameraState): boolean {
  return state.mode === "tpp" && state.following && state.followFacing && !state.editing;
}

function resolveMode(state: CameraState): CameraState {
  if (state.editing) return { ...state, mode: "free" };
  if (state.mode === "fpp") return state;
  if (state.view === "2d") return { ...state, mode: "map2d" };
  if (state.campus && state.zoomRatio >= CAMPUS_2D_ZOOM_THRESHOLD_RATIO) return { ...state, mode: "map2d" };
  return { ...state, mode: state.following ? "tpp" : "free" };
}

function focusCharacter(state: CameraState): CameraState {
  return resolveMode({ ...state, mode: state.mode === "fpp" ? "fpp" : "tpp", following: true, zoomRatio: CAMPUS_MIN_ZOOM_RATIO, distanceM: LIVE_OFFICE_FOCUS_DISTANCE_M });
}

function toggleFirstPerson(state: CameraState): CameraState {
  if (state.editing || state.view === "2d") return state;
  if (state.mode === "fpp") return { ...focusCharacter({ ...state, mode: "tpp" }), followFacing: state.followFacing, elevationRad: DEFAULT_TPP_ELEVATION_RAD };
  return { ...state, mode: "fpp", following: true, arrival: "ready" };
}

function setCameraView(state: CameraState, view: CameraState["view"]): CameraState {
  const leavesOverview = view === "3d" && state.mode === "map2d";
  if (state.view === view && state.mode !== "fpp" && !leavesOverview) return state;
  if (view === "3d") return focusCharacter({ ...state, view, mode: "tpp" });
  return resolveMode({ ...state, view, mode: "tpp", following: true });
}

export function cameraReducer(state: CameraState, event: CameraEvent): CameraState {
  switch (event.type) {
    case "room-change": return event.preserveFraming ? state : resolveMode({ ...createCameraState(event.campus, event.alignBehind), view: state.view, map2dScalePxPerM: state.map2dScalePxPerM });
    case "avatar-ready": return { ...(state.editing ? state : focusCharacter(state)), arrival: "ready" };
    case "toggle-2d": return setCameraView(state, state.mode === "map2d" ? "3d" : "2d");
    case "set-view": return setCameraView(state, event.view);
    case "map2d-scale": return { ...state, map2dScalePxPerM: clampMap2dScale(event.pxPerM) };
    case "toggle-fpp": return toggleFirstPerson(state);
    case "focus-character": return focusCharacter(state);
    case "set-camera-lock": {
      if (state.editing || state.mode === "fpp") return state;
      return resolveMode({ ...state, following: event.locked ? true : state.following, followFacing: event.locked });
    }
    case "manual-drag": return state.mode === "fpp" ? state : resolveMode({ ...state, following: false });
    case "manual-rotate": return state.mode === "fpp" ? state : { ...state, followFacing: false };
    case "walk-input": return (state.mode === "free" || state.mode === "map2d") && !state.editing && !state.following ? resolveMode({ ...state, following: true }) : state;
    case "edit": return resolveMode({ ...state, editing: event.active, following: event.active ? false : state.following });
    case "zoom": return resolveMode({ ...state, zoomRatio: MathUtils.clamp(event.ratio, CAMPUS_MIN_ZOOM_RATIO, CAMPUS_MAX_ZOOM_RATIO), ...(event.distanceM === undefined ? {} : { distanceM: Math.max(CAMERA.minZoom, event.distanceM) }) });
    case "distance": return { ...state, distanceM: MathUtils.clamp(event.distanceM, CAMERA.minZoom, event.maxDistanceM ?? CAMERA.maxZoom) };
    case "elevation": return { ...state, elevationRad: MathUtils.clamp(event.radians, MathUtils.degToRad(TPP_ELEVATION_MIN_DEG), MathUtils.degToRad(TPP_ELEVATION_MAX_DEG)) };
  }
}
