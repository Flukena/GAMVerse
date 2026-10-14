import type { Room } from "livekit-client";
import type { VoiceRoomAdapter } from "./voiceRoomSession";
import { isVoiceDeniedStatus } from "./voiceToken";

const VOICE_DISCONNECTED_ERROR_LABEL = "Voice disconnected.";

export async function createVoiceRoom(): Promise<VoiceRoomAdapter<Room>> {
  const { Room, RoomEvent, ConnectionError, DisconnectReason } = await import("livekit-client");
  return {
    room: new Room({ adaptiveStream: true, dynacast: true }),
    events: RoomEvent,
    disconnectError: reason => reason === DisconnectReason.CLIENT_INITIATED
      ? ConnectionError.cancelled(VOICE_DISCONNECTED_ERROR_LABEL)
      : ConnectionError.leaveRequest(VOICE_DISCONNECTED_ERROR_LABEL, reason ?? DisconnectReason.UNKNOWN_REASON),
    authorizationDenied: error => error instanceof ConnectionError
      && isVoiceDeniedStatus(error.status),
  };
}
