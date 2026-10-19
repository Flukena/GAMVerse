import { AMBIENT_SOUND_PREFERENCE_EVENT, readAmbientSoundsEnabled } from "./ambientSoundPreference";

let audioContext: AudioContext | null = null;
let footstepBuffer: AudioBuffer | null = null;
let footstepLoad: Promise<void> | null = null;
let footstepLoadFailed = false;
let walkingRequested = false;
let footstepSource: AudioBufferSourceNode | null = null;
let footstepGain: GainNode | null = null;
let engineBuffer: AudioBuffer | null = null;
let engineLoad: Promise<void> | null = null;
let engineLoadFailed = false;
let engineRequested = false;
let engineMoving = false;
let engineSource: AudioBufferSourceNode | null = null;
let engineGain: GainNode | null = null;
let ambientSoundsEnabled = true;
let ambientListenersReady = false;

const MOVEMENT_SOUND_VOLUME_REDUCTION = 0.85;
const FOOTSTEP_GAIN = 0.1 * MOVEMENT_SOUND_VOLUME_REDUCTION;
const ENGINE_IDLE_GAIN = 0.004 * MOVEMENT_SOUND_VOLUME_REDUCTION;
const ENGINE_DRIVE_GAIN = 0.012 * MOVEMENT_SOUND_VOLUME_REDUCTION;
const ENGINE_IDLE_PLAYBACK_RATE = 0.86;
const ENGINE_DRIVE_PLAYBACK_RATE = 1;

/** Unlock browser audio from a user gesture before movement sounds are needed. */
export function unlockMovementAudio() {
  try {
    const context = getAudioContext();
    if (context?.state === "suspended") void context.resume().catch(() => undefined);
  } catch {
    // Audio can be unavailable in restricted browser contexts.
  }
}

/** Play the local walking recording while the local player walks. */
export function updateFootstepSound(walking: boolean, sprinting: boolean, deltaS: number) {
  void deltaS;
  ensureAmbientPreferenceSync();
  walkingRequested = walking && ambientSoundsEnabled;
  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") void context.resume().catch(() => undefined);

  if (!walkingRequested) {
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
  if (walkingRequested && ambientSoundsEnabled && footstepBuffer && !footstepSource) startFootsteps(context, sprinting);
}

function startFootsteps(context: AudioContext, sprinting: boolean) {
  if (!footstepBuffer || footstepSource || !walkingRequested || !ambientSoundsEnabled) return;
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

/** Keep the supplied car recording softly mixed while the local player is driving. */
export function updateVehicleEngineSound(driving: boolean, moving: boolean) {
  try {
    ensureAmbientPreferenceSync();
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    engineRequested = driving && ambientSoundsEnabled;
    engineMoving = moving;
    if (!engineRequested) {
      stopEngine(context);
      return;
    }
    if (engineSource && engineGain) {
      updateEngineMix(context);
      return;
    }
    if (engineBuffer) startEngine(context);
    else if (!engineLoad && !engineLoadFailed) void loadEngine(context);
  } catch {
    // Audio can be unavailable in restricted or muted browser contexts.
  }
}

async function loadEngine(context: AudioContext) {
  if (!engineLoad) {
    engineLoad = fetch(`${import.meta.env.BASE_URL}assets/car-engine.mp3`)
      .then(response => {
        if (!response.ok) throw new Error(`Vehicle audio request failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then(data => context.decodeAudioData(data))
      .then(buffer => { engineBuffer = buffer; })
      .catch(() => { engineLoad = null; engineLoadFailed = true; });
  }
  await engineLoad;
  if (engineRequested && ambientSoundsEnabled && engineBuffer && !engineSource) startEngine(context);
}

function startEngine(context: AudioContext) {
  if (!engineBuffer || engineSource || !engineRequested || !ambientSoundsEnabled) return;
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = engineBuffer;
  source.loop = true;
  source.playbackRate.setValueAtTime(engineMoving ? ENGINE_DRIVE_PLAYBACK_RATE : ENGINE_IDLE_PLAYBACK_RATE, context.currentTime);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(engineMoving ? ENGINE_DRIVE_GAIN : ENGINE_IDLE_GAIN, context.currentTime + 0.2);
  source.connect(gain);
  gain.connect(context.destination);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    if (engineSource === source) {
      engineSource = null;
      engineGain = null;
    }
  };
  engineSource = source;
  engineGain = gain;
  source.start();
}

function updateEngineMix(context: AudioContext) {
  if (!engineSource || !engineGain) return;
  const now = context.currentTime;
  engineSource.playbackRate.setTargetAtTime(engineMoving ? ENGINE_DRIVE_PLAYBACK_RATE : ENGINE_IDLE_PLAYBACK_RATE, now, 0.16);
  engineGain.gain.setTargetAtTime(engineMoving ? ENGINE_DRIVE_GAIN : ENGINE_IDLE_GAIN, now, 0.12);
}

function stopEngine(context: AudioContext) {
  if (!engineSource || !engineGain) return;
  const source = engineSource;
  const gain = engineGain;
  engineSource = null;
  engineGain = null;
  gain.gain.cancelScheduledValues(context.currentTime);
  gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.025);
  source.stop(context.currentTime + 0.14);
}

function ensureAmbientPreferenceSync() {
  if (ambientListenersReady || typeof window === "undefined") return;
  ambientListenersReady = true;
  const applyPreference = (enabled: boolean) => {
    ambientSoundsEnabled = enabled;
    if (enabled) return;
    walkingRequested = false;
    engineRequested = false;
    if (audioContext) {
      stopFootsteps(audioContext);
      stopEngine(audioContext);
    }
  };
  applyPreference(readAmbientSoundsEnabled());
  window.addEventListener(AMBIENT_SOUND_PREFERENCE_EVENT, (event) => applyPreference((event as CustomEvent<boolean>).detail));
  window.addEventListener("storage", () => applyPreference(readAmbientSoundsEnabled()));
}

function getAudioContext() {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  if (audioContext?.state === "closed") audioContext = null;
  audioContext ??= new window.AudioContext();
  return audioContext;
}
