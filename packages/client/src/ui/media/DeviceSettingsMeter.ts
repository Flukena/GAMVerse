export const MICROPHONE_METER_MAX_PERCENT = 100;

export function microphoneLevelPercent(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let squaredAmplitude = 0;
  for (const sample of samples) squaredAmplitude += sample * sample;
  return Math.min(MICROPHONE_METER_MAX_PERCENT, Math.round(Math.sqrt(squaredAmplitude / samples.length) * MICROPHONE_METER_MAX_PERCENT));
}
