import { microphoneLevelPercent } from "./DeviceSettingsMeter";

const MICROPHONE_ANALYSER_SAMPLE_COUNT = 256;

export interface MicrophoneMeter {
  readLevelPercent(): number;
  dispose(): void;
}

function closeMeterResources(context: AudioContext | null, source: MediaStreamAudioSourceNode | null, analyser: AnalyserNode | null, onUnavailable: () => void): void {
  source?.disconnect();
  analyser?.disconnect();
  if (context) void context.close().catch(onUnavailable);
}

export function openMicrophoneMeter(stream: MediaStream, onUnavailable: () => void, createContext = () => new AudioContext()): MicrophoneMeter | null {
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  try {
    context = createContext();
    source = context.createMediaStreamSource(stream);
    const activeAnalyser = context.createAnalyser();
    analyser = activeAnalyser;
    activeAnalyser.fftSize = MICROPHONE_ANALYSER_SAMPLE_COUNT;
    source.connect(activeAnalyser);
    const samples = new Float32Array(MICROPHONE_ANALYSER_SAMPLE_COUNT);
    void context.resume().catch(onUnavailable);
    return {
      readLevelPercent() { activeAnalyser.getFloatTimeDomainData(samples); return microphoneLevelPercent(samples); },
      dispose() { closeMeterResources(context, source, analyser, onUnavailable); },
    };
  } catch (error) {
    closeMeterResources(context, source, analyser, onUnavailable);
    if (!(error instanceof Error)) throw error;
    onUnavailable();
    return null;
  }
}
