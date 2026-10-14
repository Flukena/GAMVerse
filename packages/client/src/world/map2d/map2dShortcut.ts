import { MAP2D_TOGGLE_KEY_CODE } from "./constants";

const EDITABLE_TAG_NAMES = new Set(["INPUT", "TEXTAREA", "SELECT"]);
export type Map2dShortcutState = { paused: boolean; buildMode: boolean; mapEditMode: boolean };
export type ShortcutTarget = { isContentEditable: boolean; tagName: string } | null;
export interface Map2dShortcutListener {
  state(): Map2dShortcutState;
  toggle(): void;
}

export function shouldToggleMap2d(
  event: { code: string; repeat: boolean },
  state: Map2dShortcutState,
  target: ShortcutTarget,
): boolean {
  if (event.code !== MAP2D_TOGGLE_KEY_CODE || event.repeat) return false;
  if (state.paused || state.buildMode || state.mapEditMode) return false;
  return target === null || (!target.isContentEditable && !EDITABLE_TAG_NAMES.has(target.tagName));
}

export function registerMap2dShortcut(windowTarget: Window, listener: Map2dShortcutListener): () => void {
  const keyDown = (event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!shouldToggleMap2d(event, listener.state(), target)) return;
    event.preventDefault();
    listener.toggle();
  };
  windowTarget.addEventListener("keydown", keyDown);
  return () => windowTarget.removeEventListener("keydown", keyDown);
}
