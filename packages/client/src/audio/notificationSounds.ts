let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

function getAudioContext() {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  if (audioContext?.state === "closed") audioContext = null;
  audioContext ??= new window.AudioContext();
  return audioContext;
}
/** Resume notification audio from a real user gesture before async room events need it. */
export function unlockSocialNotificationAudio() {
  try {
    const context = getAudioContext();
    if (context?.state === "suspended") void context.resume().catch(() => undefined);
  } catch {
    // Audio can be unavailable in restricted browser contexts.
  }
}

/** Small synthesized notification cues; no audio files or network requests are needed. */
export function playSocialNotificationSound(kind: "wave" | "follow" | "chat" | "meet" | "spotlight" | "room-enter" | "room-exit") {
  const now = performance.now();
  if (now - lastPlayedAt < 220) return;
  lastPlayedAt = now;

  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const notes = kind === "wave" ? [660, 880]
      : kind === "follow" ? [523, 659, 784]
        : kind === "chat" ? [880, 660]
          : kind === "meet" ? [587, 740, 880]
            : kind === "spotlight" ? [784, 988]
        : kind === "room-enter" ? [740, 988]
          : [587, 440];
    notes.forEach((frequency, index) => {
      const start = context.currentTime + index * 0.075;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.075, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.12);
    });
  } catch {
    // Sound can be unavailable in restricted or muted browser contexts.
  }
}
