import { browserDeviceStorage, DEFAULT_MEDIA_DEVICE_ID, persistMediaDevicePreferences, readMediaDevicePreferences } from "./mediaDevicePreferences";

export type AudioDevicePreferences = { inputDeviceId: string; outputDeviceId: string };
export type AudioDeviceSwitcher = { switchActiveDevice(kind: "audioinput" | "audiooutput", deviceId: string): Promise<boolean> };

export function readAudioDevicePreferences(): AudioDevicePreferences {
  const preferences = readMediaDevicePreferences();
  return { inputDeviceId: preferences.audioinput, outputDeviceId: preferences.audiooutput };
}

export function saveAudioInputDevice(deviceId: string): void {
  persistMediaDevicePreferences({ ...readMediaDevicePreferences(), audioinput: deviceId || DEFAULT_MEDIA_DEVICE_ID }, browserDeviceStorage());
}

export function saveAudioOutputDevice(deviceId: string): void {
  persistMediaDevicePreferences({ ...readMediaDevicePreferences(), audiooutput: deviceId || DEFAULT_MEDIA_DEVICE_ID }, browserDeviceStorage());
}

export async function applyAudioInputPreference(room: AudioDeviceSwitcher, preferences: AudioDevicePreferences): Promise<void> {
  if (!preferences.inputDeviceId) return;
  const success = await room.switchActiveDevice("audioinput", preferences.inputDeviceId);
  if (!success) throw new Error("The selected microphone is unavailable.");
}
