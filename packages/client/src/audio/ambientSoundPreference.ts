const AMBIENT_SOUND_STORAGE_KEY = "gamverse.ambient-sounds.enabled";
const LEGACY_FOOTSTEP_STORAGE_KEY = "gamverse.footsteps.enabled";
export const AMBIENT_SOUND_PREFERENCE_EVENT = "gamverse-ambient-sounds-changed";

export function readAmbientSoundsEnabled(): boolean {
  try {
    const stored = window.localStorage.getItem(AMBIENT_SOUND_STORAGE_KEY);
    if (stored !== null) return stored !== "false";
    return window.localStorage.getItem(LEGACY_FOOTSTEP_STORAGE_KEY) !== "false";
  } catch (cause) {
    if (cause instanceof DOMException) return true;
    throw cause;
  }
}

export function setAmbientSoundsEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(AMBIENT_SOUND_STORAGE_KEY, String(enabled));
  } catch (cause) {
    if (!(cause instanceof DOMException)) throw cause;
  }
  window.dispatchEvent(new CustomEvent<boolean>(AMBIENT_SOUND_PREFERENCE_EVENT, { detail: enabled }));
}
