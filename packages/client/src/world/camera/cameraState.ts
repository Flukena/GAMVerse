import { CAMERA } from "@gammyverse/shared";
import { MathUtils } from "three";
import { CAMPUS_2D_ZOOM_THRESHOLD_RATIO, CAMPUS_MAX_ZOOM_RATIO, CAMPUS_MIN_ZOOM_RATIO, DEFAULT_CAMPUS_ELEVATION_DEG, DEFAULT_TPP_ELEVATION_RAD, LIVE_OFFICE_FOCUS_DISTANCE_M, TPP_ELEVATION_MAX_DEG, TPP_ELEVATION_MIN_DEG } from "./constants";

export type CameraMode = "tpp" | "fpp" | "free" | "map2d";
export type CameraState = {
  mode: CameraMode;
  following: boolean;
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
  | { type: "focus-character" }
  | { type: "manual-drag" }
  | { type: "walk-input" }
  | { type: "edit"; active: boolean }
  | { type: "zoom"; ratio: number; distanceM?: number }
  | { type: "distance"; distanceM: number; maxDistanceM?: number }
  | { type: "elevation"; radians: number };

export function createCameraState(campus: boolean, alignBehind = true): CameraState {
  return {
    mode: "tpp", following: true, editing: false, campus, arrival: "awaiting-avatar", alignBehind,
    distanceM: LIVE_OFFICE_FOCUS_DISTANCE_M, zoomRatio: CAMPUS_MAX_ZOOM_RATIO,
    elevationRad: campus ? MathUtils.degToRad(DEFAULT_CAMPUS_ELEVATION_DEG) : DEFAULT_TPP_ELEVATION_RAD,
  };
}

function resolveMode(state: CameraState): CameraState {
  if (state.editing) return { ...state, mode: "free" };
  if (state.mode === "fpp") return state;
  if (state.campus && state.zoomRatio >= CAMPUS_2D_ZOOM_THRESHOLD_RATIO) return { ...state, mode: "map2d" };
  return { ...state, mode: state.following ? "tpp" : "free" };
}

function focusCharacter(state: CameraState): CameraState {
  return resolveMode({ ...state, mode: state.mode === "fpp" ? "fpp" : "tpp", following: true, zoomRatio: CAMPUS_MIN_ZOOM_RATIO, distanceM: LIVE_OFFICE_FOCUS_DISTANCE_M });
}

function toggleFirstPerson(state: CameraState): CameraState {
  if (state.editing) return state;
  if (state.mode === "fpp") return { ...focusCharacter({ ...state, mode: "tpp" }), elevationRad: DEFAULT_TPP_ELEVATION_RAD };
  return { ...state, mode: "fpp", following: true, arrival: "ready" };
}

export function cameraReducer(state: CameraState, event: CameraEvent): CameraState {
  switch (event.type) {
    case "room-change": return event.preserveFraming ? state : createCameraState(event.campus, event.alignBehind);
    case "avatar-ready": return { ...(state.editing ? state : focusCharacter(state)), arrival: "ready" };
    case "toggle-fpp": return toggleFirstPerson(state);
    case "focus-character": return focusCharacter(state);
    case "manual-drag": return state.mode === "fpp" ? state : resolveMode({ ...state, following: false });
    case "walk-input": return state.mode === "free" && !state.editing ? resolveMode({ ...state, following: true }) : state;
    case "edit": return resolveMode({ ...state, editing: event.active, following: event.active ? false : state.following });
    case "zoom": return resolveMode({ ...state, zoomRatio: MathUtils.clamp(event.ratio, CAMPUS_MIN_ZOOM_RATIO, CAMPUS_MAX_ZOOM_RATIO), ...(event.distanceM === undefined ? {} : { distanceM: Math.max(CAMERA.minZoom, event.distanceM) }) });
    case "distance": return { ...state, distanceM: MathUtils.clamp(event.distanceM, CAMERA.minZoom, event.maxDistanceM ?? CAMERA.maxZoom) };
    case "elevation": return { ...state, elevationRad: MathUtils.clamp(event.radians, MathUtils.degToRad(TPP_ELEVATION_MIN_DEG), MathUtils.degToRad(TPP_ELEVATION_MAX_DEG)) };
  }
}
