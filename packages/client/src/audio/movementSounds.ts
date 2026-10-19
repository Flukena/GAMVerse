let audioContext: AudioContext | null = null;
let footstepBuffer: AudioBuffer | null = null;
let footstepLoad: Promise<void> | null = null;
let footstepLoadFailed = false;
let walkingRequested = false;
let footstepSource: AudioBufferSourceNode | null = null;
let footstepGain: GainNode | null = null;
let engine: { oscillator: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;

const FOOTSTEP_GAIN = 0.1;
const ENGINE_IDLE_GAIN = 0.004;
const ENGINE_DRIVE_GAIN = 0.012;

/** Unlock browser audio from a user gesture before movement sounds are needed. */
export function unlockMovementAudio() {
  try {
    const context = getAudioContext();
    if (context?.state === "suspended") void context.resume().catch(() => undefined);
  } catch {
    // Audio can be unavailable in restricted browser contexts.
  }
}

/** Play a softly mixed licensed sneaker-on-concrete recording while the local player walks. */
export function updateFootstepSound(walking: boolean, sprinting: boolean, deltaS: number) {
  void deltaS;
  walkingRequested = walking;
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") void context.resume().catch(() => undefined);

  if (!walking) {
    footstepLoadFailed = false;
    stopFootsteps(context);
    return;
  }
  if (footstepSource) {
    footstepSource.playbackRate.setTargetAtTime(sprinting ? 1.25 : 1, context.currentTime, 0.12);
    return;
  }
  if (footstepBuffer) startFootsteps(context, sprinting);
  else if (!footstepLoad && !footstepLoadFailed) void loadFootsteps(context, sprinting);
}

async function loadFootsteps(context: AudioContext, sprinting: boolean) {
  if (!footstepLoad) {
    footstepLoad = fetch(`${import.meta.env.BASE_URL}assets/walking-on-concrete.mp3`)
      .then(response => {
        if (!response.ok) throw new Error(`Footstep audio request failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then(data => context.decodeAudioData(data))
      .then(buffer => { footstepBuffer = buffer; })
      .catch(() => { footstepLoad = null; footstepLoadFailed = true; });
  }
  await footstepLoad;
  if (walkingRequested && footstepBuffer && !footstepSource) startFootsteps(context, sprinting);
}

function startFootsteps(context: AudioContext, sprinting: boolean) {
  if (!footstepBuffer || footstepSource || !walkingRequested) return;
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = footstepBuffer;
  source.loop = true;
  source.playbackRate.setValueAtTime(sprinting ? 1.25 : 1, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(FOOTSTEP_GAIN, context.currentTime + 0.08);
  source.connect(gain);
  gain.connect(context.destination);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    if (footstepSource === source) {
      footstepSource = null;
      footstepGain = null;
    }
  };
  footstepSource = source;
  footstepGain = gain;
  source.start();
}

function stopFootsteps(context: AudioContext) {
  if (!footstepSource || !footstepGain) return;
  const source = footstepSource;
  const gain = footstepGain;
  footstepSource = null;
  footstepGain = null;
  gain.gain.cancelScheduledValues(context.currentTime);
  gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.025);
  source.stop(context.currentTime + 0.12);
}

/** Keep a soft local engine hum while the local player is in a vehicle. */
export function updateVehicleEngineSound(driving: boolean, moving: boolean) {
  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    if (!driving) {
      stopEngine(context);
      return;
    }
    if (!engine) {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(48, context.currentTime);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(145, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      engine = { oscillator, filter, gain };
    }
    const now = context.currentTime;
    engine.oscillator.frequency.setTargetAtTime(moving ? 68 : 48, now, 0.16);
    engine.gain.gain.setTargetAtTime(moving ? ENGINE_DRIVE_GAIN : ENGINE_IDLE_GAIN, now, 0.12);
  } catch {
    // Audio can be unavailable in restricted or muted browser contexts.
  }
}

function stopEngine(context: AudioContext) {
  if (!engine) return;
  const stopped = engine;
  engine = null;
  stopped.gain.gain.cancelScheduledValues(context.currentTime);
  stopped.gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.025);
  stopped.oscillator.onended = () => {
    stopped.oscillator.disconnect();
    stopped.filter.disconnect();
    stopped.gain.disconnect();
  };
  stopped.oscillator.stop(context.currentTime + 0.14);
}

function getAudioContext() {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  if (audioContext?.state === "closed") audioContext = null;
  audioContext ??= new window.AudioContext();
  return audioContext;
}

