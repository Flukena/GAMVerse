export type MediaDevicePreferences = Record<MediaDeviceKind, string>;
export interface DevicePreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const LEGACY_AUDIO_INPUT_DEVICE_KEY = "gammyverse.audioInputDeviceId";
export const LEGACY_AUDIO_OUTPUT_DEVICE_KEY = "gammyverse.audioOutputDeviceId";
export const MEDIA_DEVICE_STORAGE_KEY = "gamverse.mediaDevices.v1";
export const MEDIA_DEVICE_KINDS: readonly MediaDeviceKind[] = ["audioinput", "videoinput", "audiooutput"];
export const DEFAULT_MEDIA_DEVICE_ID = "default";
const DEVICE_SWITCH_FAILED_LABEL = "The selected media device is unavailable. Choose another device.";

export function defaultMediaDevicePreferences(): MediaDevicePreferences {
  return { audioinput: DEFAULT_MEDIA_DEVICE_ID, videoinput: DEFAULT_MEDIA_DEVICE_ID, audiooutput: DEFAULT_MEDIA_DEVICE_ID };
}

export function browserDeviceStorage(): DevicePreferenceStorage | undefined {
  try { return globalThis.localStorage; }
  catch { return undefined; } // Browsers can deny storage access; device controls remain usable.
}

export function readMediaDevicePreferences(storage = browserDeviceStorage()): MediaDevicePreferences {
  const preferences = defaultMediaDevicePreferences();
  try {
    preferences.audioinput = storage?.getItem(LEGACY_AUDIO_INPUT_DEVICE_KEY) || DEFAULT_MEDIA_DEVICE_ID;
    preferences.audiooutput = storage?.getItem(LEGACY_AUDIO_OUTPUT_DEVICE_KEY) || DEFAULT_MEDIA_DEVICE_ID;
    const stored: unknown = JSON.parse(storage?.getItem(MEDIA_DEVICE_STORAGE_KEY) ?? "null");
    if (!stored || typeof stored !== "object") return preferences;
    for (const kind of MEDIA_DEVICE_KINDS) {
      const value: unknown = Reflect.get(stored, kind);
      if (typeof value === "string" && value) preferences[kind] = value;
    }
  } catch { return preferences; } // Corrupt or inaccessible preferences use browser defaults.
  return preferences;
}

export function persistMediaDevicePreferences(preferences: MediaDevicePreferences, storage?: DevicePreferenceStorage): void {
  try {
    storage?.setItem(MEDIA_DEVICE_STORAGE_KEY, JSON.stringify(preferences));
    storage?.setItem(LEGACY_AUDIO_INPUT_DEVICE_KEY, preferences.audioinput);
    storage?.setItem(LEGACY_AUDIO_OUTPUT_DEVICE_KEY, preferences.audiooutput);
  }
  catch { /* Storage denial must not prevent an explicit device selection. */ }
}

export interface DeviceSwitchRoom {
  switchActiveDevice(kind: MediaDeviceKind, deviceId: string, exact?: boolean): Promise<boolean>;
}

export async function applyMediaDevicePreferences(room: DeviceSwitchRoom, preferences: MediaDevicePreferences, speakerSupported = true): Promise<void> {
  for (const kind of MEDIA_DEVICE_KINDS) {
    if (kind === "audiooutput" && !speakerSupported) continue;
    const switched = await room.switchActiveDevice(kind, preferences[kind], preferences[kind] !== DEFAULT_MEDIA_DEVICE_ID);
    if (!switched) throw new Error(DEVICE_SWITCH_FAILED_LABEL);
  }
}

export function mediaDeviceCaptureDefaults(preferences: MediaDevicePreferences) {
  const constraint = (deviceId: string) => deviceId === DEFAULT_MEDIA_DEVICE_ID ? { ideal: deviceId } : { exact: deviceId };
  return {
    audioCaptureDefaults: { deviceId: constraint(preferences.audioinput) },
    videoCaptureDefaults: { deviceId: constraint(preferences.videoinput) },
  };
}
