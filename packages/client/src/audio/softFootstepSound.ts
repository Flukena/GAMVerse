const FOOTSTEP_DURATION_S = 0.095;
const FOOTSTEP_ATTACK_S = 0.009;
const FOOTSTEP_FREQUENCY_START_HZ = 150;
const FOOTSTEP_FREQUENCY_END_HZ = 65;
const FOOTSTEP_PEAK_GAIN = 0.035;
const FOOTSTEP_SILENT_GAIN = 0.0001;

export interface FootstepSound {
  unlock(): void;
  play(): void;
  stop(): void;
  dispose(): void;
}

/** Quiet, rounded shoe impacts; the context is only created inside a user gesture. */
export class SoftFootstepSound implements FootstepSound {
  private context: AudioContext | null = null;
  private disposed = false;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  unlock() {
    if (this.disposed || typeof window.AudioContext === "undefined") return;
    try {
      this.context ??= new window.AudioContext();
    } catch (cause) {
      if (cause instanceof DOMException) return;
      throw cause;
    }
    if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
  }

  play() {
    const context = this.context;
    if (context?.state !== "running") return;
    this.stop();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAtS = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(FOOTSTEP_FREQUENCY_START_HZ, startAtS);
    oscillator.frequency.exponentialRampToValueAtTime(FOOTSTEP_FREQUENCY_END_HZ, startAtS + FOOTSTEP_DURATION_S);
    gain.gain.setValueAtTime(FOOTSTEP_SILENT_GAIN, startAtS);
    gain.gain.exponentialRampToValueAtTime(FOOTSTEP_PEAK_GAIN, startAtS + FOOTSTEP_ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(FOOTSTEP_SILENT_GAIN, startAtS + FOOTSTEP_DURATION_S);
    oscillator.connect(gain);
    gain.connect(context.destination);
    this.oscillator = oscillator;
    this.gain = gain;
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      if (this.oscillator === oscillator) {
        this.oscillator = null;
        this.gain = null;
      }
    };
    oscillator.start(startAtS);
    oscillator.stop(startAtS + FOOTSTEP_DURATION_S);
  }

  stop() {
    if (this.oscillator) {
      this.oscillator.onended = null;
      this.oscillator.stop();
      this.oscillator.disconnect();
    }
    this.gain?.disconnect();
    this.oscillator = null;
    this.gain = null;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => undefined);
    this.context = null;
  }
}
