const FOOTSTEP_DURATION_S = 0.14;
const FOOTSTEP_ATTACK_S = 0.002;
const FOOTSTEP_NOISE_DECAY_S = 0.032;
const FOOTSTEP_THUD_DECAY_S = 0.018;
const FOOTSTEP_HIGHPASS_HZ = 180;
const FOOTSTEP_THUD_MIX_RATIO = 0.22;
const FOOTSTEP_GRAIN_DEPTH_RATIO = 0.45;
const FOOTSTEP_PEAK_AMPLITUDE = 0.8;
const FOOTSTEP_MIN_SAMPLE_RATE_HZ = 8000;
const FOOTSTEP_MAX_SAMPLE_RATE_HZ = 384000;
const FULL_CIRCLE_RAD = Math.PI * 2;
const NOISE_MULTIPLIER = 1664525;
const NOISE_INCREMENT = 1013904223;
const NOISE_INTEGER_RANGE = 4294967296;
const FOOTSTEP_VARIANTS = [
  { seed: 17029, lowpassHz: 2400, thudHz: 100, grainHz: 83 },
  { seed: 38447, lowpassHz: 2100, thudHz: 94, grainHz: 71 },
  { seed: 71363, lowpassHz: 2700, thudHz: 108, grainHz: 97 },
  { seed: 98561, lowpassHz: 2250, thudHz: 97, grainHz: 89 },
] as const;

type FootstepVariant = typeof FOOTSTEP_VARIANTS[number];

function createNoise(seed: number) {
  let state = seed;
  return () => {
    state = (Math.imul(state, NOISE_MULTIPLIER) + NOISE_INCREMENT) >>> 0;
    return state / NOISE_INTEGER_RANGE * 2 - 1;
  };
}

function normalizePeak(samples: Float32Array<ArrayBuffer>) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const scale = FOOTSTEP_PEAK_AMPLITUDE / peak;
  for (let index = 0; index < samples.length; index++) samples[index] = samples[index]! * scale;
  return samples;
}

function createFootstepVariant(sampleRateHz: number, variant: FootstepVariant) {
  const samples = new Float32Array(Math.round(FOOTSTEP_DURATION_S * sampleRateHz));
  const noise = createNoise(variant.seed);
  const lowpassRatio = 1 - Math.exp(-FULL_CIRCLE_RAD * variant.lowpassHz / sampleRateHz);
  const highpassRatio = 1 - Math.exp(-FULL_CIRCLE_RAD * FOOTSTEP_HIGHPASS_HZ / sampleRateHz);
  let lowpass = 0;
  let highpass = 0;
  for (let index = 0; index < samples.length; index++) {
    const timeS = index / sampleRateHz;
    const progressRatio = index / (samples.length - 1);
    const envelope = Math.min(1, timeS / FOOTSTEP_ATTACK_S) * (1 - progressRatio) ** 2;
    lowpass += (noise() - lowpass) * lowpassRatio;
    highpass += (lowpass - highpass) * highpassRatio;
    const grain = 1 - FOOTSTEP_GRAIN_DEPTH_RATIO * Math.abs(Math.sin(FULL_CIRCLE_RAD * variant.grainHz * timeS));
    const crunch = (lowpass - highpass) * grain * Math.exp(-timeS / FOOTSTEP_NOISE_DECAY_S);
    const thud = Math.sin(FULL_CIRCLE_RAD * variant.thudHz * timeS) * Math.exp(-timeS / FOOTSTEP_THUD_DECAY_S);
    samples[index] = envelope * (crunch + thud * FOOTSTEP_THUD_MIX_RATIO);
  }
  return normalizePeak(samples);
}

/** Original dry, block-game footfalls synthesized once per audio context. No game assets. */
export function createFootstepPcmVariants(sampleRateHz: number): readonly Float32Array<ArrayBuffer>[] {
  if (!Number.isFinite(sampleRateHz) || sampleRateHz < FOOTSTEP_MIN_SAMPLE_RATE_HZ || sampleRateHz > FOOTSTEP_MAX_SAMPLE_RATE_HZ) {
    throw new RangeError("Unsupported footstep sample rate");
  }
  return FOOTSTEP_VARIANTS.map((variant) => createFootstepVariant(sampleRateHz, variant));
}
