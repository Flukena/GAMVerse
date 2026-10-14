const INPUT_DEVICE_KEY = "gammyverse.audioInputDeviceId";
const OUTPUT_DEVICE_KEY = "gammyverse.audioOutputDeviceId";

export type AudioDevicePreferences = { inputDeviceId: string; outputDeviceId: string };
export type AudioDeviceSwitcher = { switchActiveDevice(kind: "audioinput" | "audiooutput", deviceId: string): Promise<boolean> };

export function readAudioDevicePreferences(): AudioDevicePreferences {
  try {
    return {
      inputDeviceId: window.localStorage.getItem(INPUT_DEVICE_KEY) ?? "",
      outputDeviceId: window.localStorage.getItem(OUTPUT_DEVICE_KEY) ?? "",
    };
  } catch {
    return { inputDeviceId: "", outputDeviceId: "" };
  }
}

export function saveAudioInputDevice(deviceId: string): void {
  try { window.localStorage.setItem(INPUT_DEVICE_KEY, deviceId); }
  catch { /* Keep the selection in memory if browser storage is unavailable. */ }
}

export function saveAudioOutputDevice(deviceId: string): void {
  try { window.localStorage.setItem(OUTPUT_DEVICE_KEY, deviceId); }
  catch { /* Keep the selection in memory if browser storage is unavailable. */ }
}

export async function applyAudioInputPreference(room: AudioDeviceSwitcher, preferences: AudioDevicePreferences): Promise<void> {
  if (!preferences.inputDeviceId) return;
  const success = await room.switchActiveDevice("audioinput", preferences.inputDeviceId);
  if (!success) throw new Error("The selected microphone is unavailable.");
}
