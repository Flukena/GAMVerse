import assert from "node:assert/strict";
import test from "node:test";
import { RoomEvent } from "livekit-client";
import { observeMeetingRoom, type MeetingMediaState, type ObservableMeetingRoom, type ObservedParticipant, type ObservedPublication } from "./observeMeetingRoom";

class FakeRoom implements ObservableMeetingRoom {
  state = "connected";
  localParticipant: ObservedParticipant = { identity: "opaque-local", isSpeaking: false, trackPublications: new Map() };
  remoteParticipants = new Map<string, ObservedParticipant>();
  listeners = new Map<RoomEvent, Set<() => void>>();
  on(event: RoomEvent, callback: () => void) {
    const callbacks = this.listeners.get(event) ?? new Set();
    callbacks.add(callback);
    this.listeners.set(event, callbacks);
  }
  off(event: RoomEvent, callback: () => void) { this.listeners.get(event)?.delete(callback); }
  emit(event: RoomEvent) { for (const callback of this.listeners.get(event) ?? []) callback(); }
}

test("observer snapshots camera-off people and publication, mute and reconnect changes", () => {
  const room = new FakeRoom();
  const states: MeetingMediaState[] = [];
  const publications = new Map<string, ObservedPublication>();
  room.remoteParticipants.set("remote", { identity: "opaque-remote", isSpeaking: false, trackPublications: publications });
  const dispose = observeMeetingRoom(room, "binding", state => states.push(state));
  assert.equal(states.at(-1)?.participants.length, 2);
  publications.set("camera", { trackSid: "camera", source: "camera", isMuted: false, isSubscribed: false });
  room.emit(RoomEvent.TrackPublished);
  assert.equal(states.at(-1)?.participants[1].publications[0].isSubscribed, false);
  publications.set("camera", { trackSid: "camera", source: "camera", isMuted: true, isSubscribed: false });
  room.emit(RoomEvent.TrackMuted);
  assert.equal(states.at(-1)?.participants[1].publications[0].isMuted, true);
  assert.equal(states[1].participants[1].publications[0].isMuted, false);
  room.state = "reconnecting";
  room.emit(RoomEvent.Reconnecting);
  assert.equal(states.at(-1)?.connected, false);
  dispose();
});

test("disposing observer leaves other listeners intact and prevents late callbacks", () => {
  const room = new FakeRoom();
  let unrelatedUpdates = 0;
  const unrelated = () => { unrelatedUpdates += 1; };
  room.on(RoomEvent.TrackMuted, unrelated);
  let observedUpdates = 0;
  const dispose = observeMeetingRoom(room, "old", () => { observedUpdates += 1; });
  const late = [...(room.listeners.get(RoomEvent.TrackMuted) ?? [])].find(callback => callback !== unrelated);
  dispose();
  room.emit(RoomEvent.TrackMuted);
  late?.();
  assert.equal(observedUpdates, 1);
  assert.equal(unrelatedUpdates, 1);
  assert.equal([...room.listeners.values()].reduce((count, listeners) => count + listeners.size, 0), 1);
});
