const STORAGE_KEY = "gammyverse.voiceParticipantPreferences.v1";

export function readVoiceParticipantAudioLevels(): Map<string, number> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return new Map();
    return new Map(Object.entries(value).flatMap(([username, level]) =>
      typeof level === "number" && Number.isFinite(level) && username.length > 0
        ? [[username.toLocaleLowerCase(), Math.max(0, Math.min(1.5, level))]]
        : [],
    ));
  } catch {
    return new Map();
  }
}

export function saveVoiceParticipantAudioLevels(levels: ReadonlyMap<string, number>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(levels)));
  } catch {
    // Keep this preference in memory if the browser blocks local storage.
  }
}
