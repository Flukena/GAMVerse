import { createFootstepPcmVariants } from "./footstepPcm";

const FOOTSTEP_PLAYBACK_RATES_RATIO = [1, 0.97, 1.04, 0.99] as const;
const FOOTSTEP_GAIN_LEVELS = [0.12, 0.11, 0.125, 0.115] as const;
const FOOTSTEP_CHANNEL_COUNT = 1;
const FOOTSTEP_CHANNEL_INDEX = 0;

export interface FootstepSound {
  unlock(): void;
  play(): void;
  stop(): void;
  dispose(): void;
}

/** Cached dry crunch and rounded impacts, with one short voice active at a time. */
export class SoftFootstepSound implements FootstepSound {
  private context: AudioContext | null = null;
  private disposed = false;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private buffers: readonly AudioBuffer[] = [];
  private nextVariantIndex = 0;

  unlock() {
    if (this.disposed || typeof window.AudioContext === "undefined") return;
    try {
      if (!this.context) {
        this.context = new window.AudioContext();
        this.buffers = this.createBuffers(this.context);
      }
    } catch (cause) {
      if (cause instanceof DOMException) return;
      throw cause;
    }
    if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
  }

  private createBuffers(context: AudioContext) {
    return createFootstepPcmVariants(context.sampleRate).map((samples) => {
      const buffer = context.createBuffer(FOOTSTEP_CHANNEL_COUNT, samples.length, context.sampleRate);
      buffer.copyToChannel(samples, FOOTSTEP_CHANNEL_INDEX);
      return buffer;
    });
  }

  play() {
    const context = this.context;
    if (context?.state !== "running" || this.buffers.length === 0) return;
    this.stop();
    const index = this.nextVariantIndex;
    this.nextVariantIndex = (index + 1) % this.buffers.length;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = this.buffers[index]!;
    source.playbackRate.value = FOOTSTEP_PLAYBACK_RATES_RATIO[index]!;
    gain.gain.value = FOOTSTEP_GAIN_LEVELS[index]!;
    source.connect(gain);
    gain.connect(context.destination);
    this.source = source;
    this.gain = gain;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.source === source) {
        this.source = null;
        this.gain = null;
      }
    };
    source.start(context.currentTime);
  }

  stop() {
    if (this.source) {
      this.source.onended = null;
      this.source.stop();
      this.source.disconnect();
    }
    this.gain?.disconnect();
    this.source = null;
    this.gain = null;
  }

  dispose() {
    this.disposed = true;
    this.stop();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => undefined);
    this.context = null;
    this.buffers = [];
  }
}
