const FOOTSTEP_ENABLED_STORAGE_KEY = "gamverse.footsteps.enabled";
export const FOOTSTEP_PREFERENCE_EVENT = "gamverse-footsteps-changed";

export function readFootstepsEnabled(): boolean {
  try {
    return window.localStorage.getItem(FOOTSTEP_ENABLED_STORAGE_KEY) !== "false";
  } catch (cause) {
    if (cause instanceof DOMException) return true;
    throw cause;
  }
}

export function setFootstepsEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(FOOTSTEP_ENABLED_STORAGE_KEY, String(enabled));
  } catch (cause) {
    if (!(cause instanceof DOMException)) throw cause;
  }
  window.dispatchEvent(new CustomEvent<boolean>(FOOTSTEP_PREFERENCE_EVENT, { detail: enabled }));
}
