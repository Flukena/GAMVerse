import type { RemoteAudioTrack } from "livekit-client";

export function attachVoiceAudio(track: Pick<RemoteAudioTrack, "attach" | "setVolume">, volume: number): HTMLAudioElement {
  track.setVolume(volume);
  const element = track.attach() as HTMLAudioElement;
  // LiveKit 2.22 ignores a stored zero while creating its Web Audio gain node.
  track.setVolume(volume);
  return element;
}
