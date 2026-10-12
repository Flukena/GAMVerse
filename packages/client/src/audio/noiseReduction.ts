import type { AudioProcessorOptions, LocalAudioTrack, Track, TrackProcessor } from "livekit-client";
import { loadRnnoise, RnnoiseWorkletNode } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

export type NoiseReductionResult = {
  supported: boolean | null;
  enabled: boolean;
  reason?: string;
};

class RnnoiseTrackProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = "gammyverse-rnnoise";
  processedTrack?: MediaStreamTrack;

  private input?: MediaStreamAudioSourceNode;
  private filter?: RnnoiseWorkletNode;
  private output?: MediaStreamAudioDestinationNode;

  async init({ track, audioContext }: AudioProcessorOptions) {
    if (audioContext.sampleRate !== 48_000) {
      throw new Error(`RNNoise requires a 48 kHz audio context (current: ${audioContext.sampleRate} Hz). Browser noise suppression remains active.`);
    }

    const [wasmBinary] = await Promise.all([
      loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl }),
      audioContext.audioWorklet.addModule(rnnoiseWorkletUrl),
    ]);

    this.input = audioContext.createMediaStreamSource(new MediaStream([track]));
    this.filter = new RnnoiseWorkletNode(audioContext, { wasmBinary, maxChannels: 1 });
    this.output = audioContext.createMediaStreamDestination();
    this.input.connect(this.filter);
    this.filter.connect(this.output);
    this.processedTrack = this.output.stream.getAudioTracks()[0];
    if (!this.processedTrack) throw new Error("RNNoise did not create an output track.");
  }

  async restart(options: AudioProcessorOptions) {
    await this.destroy();
    await this.init(options);
  }

  async destroy() {
    this.input?.disconnect();
    this.filter?.disconnect();
    this.filter?.destroy();
    this.output?.stream.getTracks().forEach((track) => track.stop());
    this.input = undefined;
    this.filter = undefined;
    this.output = undefined;
    this.processedTrack = undefined;
  }
}

const processors = new WeakMap<LocalAudioTrack, RnnoiseTrackProcessor>();
const desiredState = new WeakMap<LocalAudioTrack, boolean>();
const trackQueues = new WeakMap<LocalAudioTrack, Promise<NoiseReductionResult>>();

/** Apply local RNNoise to a microphone track without depending on LiveKit Cloud. */
export function setNoiseReduction(track: LocalAudioTrack, enabled: boolean): Promise<NoiseReductionResult> {
  desiredState.set(track, enabled);
  const previous = trackQueues.get(track) ?? Promise.resolve({ supported: null, enabled: false });
  const next = previous.catch(() => ({ supported: null, enabled: false })).then(async () => {
    const existingProcessor = processors.get(track);
    if (!desiredState.get(track)) {
      if (existingProcessor) {
        await track.stopProcessor();
        processors.delete(track);
      }
      return { supported: existingProcessor ? true : null, enabled: false };
    }

    if (existingProcessor) return { supported: true, enabled: true };

    const processor = new RnnoiseTrackProcessor();
    try {
      await track.setProcessor(processor);
      processors.set(track, processor);
      return { supported: true, enabled: true };
    } catch (cause) {
      await processor.destroy().catch(() => undefined);
      const reason = cause instanceof Error ? cause.message : String(cause);
      return { supported: false, enabled: false, reason: `${reason} Browser noise suppression remains active.` };
    }
  });
  trackQueues.set(track, next);
  return next;
}
