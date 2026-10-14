import {
  VoiceRoomSession,
  type VoiceRoom,
  type VoiceSessionDependencies,
  type VoiceSessionListener,
} from "./voiceRoomSession";

export function createOfficeMediaSession<R extends VoiceRoom>(
  dependencies: VoiceSessionDependencies<R>,
  listener: VoiceSessionListener<R>,
): VoiceRoomSession<R> {
  return new VoiceRoomSession(dependencies, listener);
}
