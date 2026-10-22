const MUTED_AUDIO_GAIN = 0;

export function voicePlaybackVolume(level: number, deafened: boolean, proximityGain = 1): number {
  return deafened ? MUTED_AUDIO_GAIN : level * proximityGain;
}
