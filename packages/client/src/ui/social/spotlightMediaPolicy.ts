import type { RemoteAudioTrack, RemoteTrack } from "livekit-client";
import { spotlightAudioVolume } from "./socialState";
import type { VoiceSessionState } from "../media/voiceRoomSession";

export function shouldStartSpotlightMicrophone(
  state: Pick<VoiceSessionState, "connected" | "muted" | "desiredMuted">,
  consented: boolean,
): boolean {
  return state.connected && state.muted && state.desiredMuted && consented;
}

export function applySpotlightAudioVolume(track: RemoteTrack, inboundAudioMuted: boolean, hasZoneAudio: boolean): void {
  if (track.kind === "audio") (track as RemoteAudioTrack).setVolume(spotlightAudioVolume(inboundAudioMuted, hasZoneAudio));
}
