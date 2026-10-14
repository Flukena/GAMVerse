import { cameraReducer, type CameraState } from "./cameraState";

export interface CameraViewListener {
  exitFirstPerson(): void;
  persistView(view: CameraState["view"]): void;
}

export function applyCameraView(
  state: CameraState,
  view: CameraState["view"],
  listener: CameraViewListener,
): CameraState {
  const next = cameraReducer(state, { type: "set-view", view });
  listener.exitFirstPerson();
  listener.persistView(next.view);
  return next;
}
