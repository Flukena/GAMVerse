import assert from "node:assert/strict";
import test from "node:test";
import { RoomEvent, type RoomEventCallbacks, type RemoteTrack } from "livekit-client";
import { VoiceRoomSession, type VoiceRoom, type VoiceSessionState } from "../media/voiceRoomSession";
import { applySpotlightAudioVolume, shouldStartSpotlightMicrophone } from "./spotlightMediaPolicy";

const FLUSH_MICROTASK_COUNT = 100;
const MAX_STATE_NOTIFICATIONS = 20;

class SpotlightRoom implements VoiceRoom {
  private readonly handlers = new Map<keyof RoomEventCallbacks, unknown>();
  microphoneCalls: boolean[] = [];
  microphoneError: Error | null = null;
  localParticipant = {
    setMicrophoneEnabled: async (enabled: boolean) => {
      this.microphoneCalls.push(enabled);
      if (enabled && this.microphoneError) throw this.microphoneError;
      return undefined;
    },
    setCameraEnabled: async () => undefined,
    setScreenShareEnabled: async () => undefined,
  };
  connect = async () => undefined;
  disconnect = async () => undefined;
  on<E extends keyof RoomEventCallbacks>(event: E, listener: RoomEventCallbacks[E]): this { this.handlers.set(event, listener); return this; }
  off<E extends keyof RoomEventCallbacks>(event: E, listener: RoomEventCallbacks[E]): this {
    if (this.handlers.get(event) === listener) this.handlers.delete(event);
    return this;
  }
}

async function flush(): Promise<void> {
  for (let count = 0; count < FLUSH_MICROTASK_COUNT; count++) await Promise.resolve();
}

function spotlight(consented: boolean, captureError: Error | null = null) {
  const room = new SpotlightRoom();
  room.microphoneError = captureError;
  const states: VoiceSessionState[] = [];
  const session = new VoiceRoomSession({
    initialMuted: true,
    createRoom: async () => ({ room, events: RoomEvent, authorizationDenied: () => false, disconnectError: () => new Error("Disconnected") }),
    fetchToken: async () => ({ url: "wss://fixture", token: "fixture" }),
  }, {
    stateChanged: state => {
      states.push(state);
      // Bound the pre-fix synchronous listener loop without mocking the session.
      if (states.length < MAX_STATE_NOTIFICATIONS && shouldStartSpotlightMicrophone(state, consented)) void session.setMuted(false);
    },
  });
  session.setTarget({ kind: "spotlight", id: "epoch", officeId: "office", sessionKey: "session" });
  return { session, room, states };
}

test("consented spotlight starts its microphone once without reentrant intent notifications", async () => {
  const f = spotlight(true);
  await flush();
  assert.equal(f.room.microphoneCalls.filter(Boolean).length, 1);
  assert.equal(f.states.at(-1)?.connected, true);
  assert.equal(f.states.at(-1)?.desiredMuted, false);
  assert.equal(f.states.at(-1)?.muted, false);
  assert.ok(f.states.length < MAX_STATE_NOTIFICATIONS);
  await f.session.dispose();
});

test("spotlight capture denial stays connected without an automatic retry loop", async () => {
  const denied = new DOMException("Permission denied", "NotAllowedError");
  const f = spotlight(true, denied);
  await flush();
  assert.equal(f.room.microphoneCalls.filter(Boolean).length, 1);
  assert.equal(f.states.at(-1)?.connected, true);
  assert.equal(f.states.at(-1)?.desiredMuted, false);
  assert.equal(f.states.at(-1)?.muted, true);
  assert.equal(f.states.at(-1)?.error?.cause, denied);
  await f.session.dispose();
});

test("a spotlight invitation without publishing consent never starts capture", async () => {
  const f = spotlight(false);
  await flush();
  assert.deepEqual(f.room.microphoneCalls, [false]);
  assert.equal(f.states.at(-1)?.desiredMuted, true);
  await f.session.dispose();
});


test("explicit deafen updates an already subscribed spotlight audio track and restores it", () => {
  const volumes: number[] = [];
  const track = { kind: "audio", setVolume(volume: number) { volumes.push(volume); } } as unknown as RemoteTrack;
  applySpotlightAudioVolume(track, false, false);
  applySpotlightAudioVolume(track, true, false);
  applySpotlightAudioVolume(track, false, false);
  assert.deepEqual(volumes, [1, 0, 1]);
});

test("audio subscribed while deafened starts silent and duplicate zone audio remains silent after undeafen", () => {
  const volumes: number[] = [];
  const track = { kind: "audio", setVolume(volume: number) { volumes.push(volume); } } as unknown as RemoteTrack;
  applySpotlightAudioVolume(track, true, false);
  assert.deepEqual(volumes, [0]);
  applySpotlightAudioVolume(track, false, true);
  applySpotlightAudioVolume(track, false, false);
  assert.deepEqual(volumes, [0, 0, 1]);
  applySpotlightAudioVolume({ kind: "video" } as RemoteTrack, true, false);
});
