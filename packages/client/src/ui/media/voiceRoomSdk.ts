import type { Room } from "livekit-client";
import type { VoiceRoomAdapter } from "./voiceRoomSession";
import { isVoiceDeniedStatus } from "./voiceToken";
import { mediaDeviceCaptureDefaults, readMediaDevicePreferences } from "./mediaDevicePreferences";

const VOICE_DISCONNECTED_ERROR_LABEL = "Voice disconnected.";

export async function createVoiceRoom(): Promise<VoiceRoomAdapter<Room>> {
  const { Room, RoomEvent, ConnectionError, DisconnectReason } = await import("livekit-client");
  const devices = readMediaDevicePreferences();
  return {
    room: new Room({
      adaptiveStream: true, dynacast: true,
      // Membership rotation disconnects proximity rooms; the session republishes only after a fresh grant.
      stopLocalTrackOnUnpublish: false,
      ...mediaDeviceCaptureDefaults(devices),
      ...(typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype
        ? { audioOutput: { deviceId: devices.audiooutput } } : {}),
    }),
    events: RoomEvent,
    disconnectError: reason => reason === DisconnectReason.CLIENT_INITIATED
      ? ConnectionError.cancelled(VOICE_DISCONNECTED_ERROR_LABEL)
      : ConnectionError.leaveRequest(VOICE_DISCONNECTED_ERROR_LABEL, reason ?? DisconnectReason.UNKNOWN_REASON),
    authorizationDenied: error => error instanceof ConnectionError
      && isVoiceDeniedStatus(error.status),
  };
}
