import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationSnapshot } from "@gammyverse/shared";
import type { MeetingVideoTrack } from "../meetings/meetingViewState";
import { selectMeetingParticipants } from "./meetingParticipantState";
import type { MeetingMediaState, ObservedPublication } from "./observeMeetingRoom";

const video: MeetingVideoTrack = { attach() {}, detach() {} };
const snapshot: ConversationSnapshot = { officeId: "office", roomIncarnationId: "room", revision: 1,
  conversation: { id: "conversation", kind: "private", mediaTarget: { id: "zone", generation: 1 }, members: [
    { id: "alice", username: "alice", sessionId: "session", displayName: "Alice", characterId: "avatar", mediaIdentity: "opaque-123" },
    { id: "bob", username: "bob", sessionId: "other-session", displayName: "Bob", characterId: "avatar", mediaIdentity: "opaque-456" },
  ] } };
function media(publications: ObservedPublication[] = []): MeetingMediaState {
  return { bindingKey: "binding", connected: true, participants: [
    { identity: "opaque-123", local: true, speaking: true, publications },
    { identity: "unadmitted", local: false, speaking: true, publications },
  ] };
}
function camera(overrides: Partial<ObservedPublication> = {}): ObservedPublication {
  return { trackSid: "camera", source: "camera", isMuted: false, isSubscribed: true, track: video, ...overrides };
}

test("admitted camera-off and disconnected people stay visible, unadmitted media is excluded", () => {
  const roster = selectMeetingParticipants(snapshot, media(), "binding");
  assert.deepEqual(roster.map(person => [person.username, person.mediaState, person.cameraTrack]), [["alice", "connected", null], ["bob", "unavailable", null]]);
  assert.equal(roster[0].local, true);
  assert.equal(roster[0].speaking, true);
  assert.equal(roster[0].microphoneMuted, true);
  assert.deepEqual(selectMeetingParticipants(null, media(), "binding"), []);
});

test("muted and unsubscribed cameras cannot expose retained SDK tracks", () => {
  assert.equal(selectMeetingParticipants(snapshot, media([camera()]), "binding")[0].cameraTrack, video);
  for (const publication of [camera({ isMuted: true }), camera({ isSubscribed: false })]) {
    assert.equal(selectMeetingParticipants(snapshot, media([publication]), "binding")[0].cameraTrack, null);
  }
  const microphone = camera({ source: "microphone", isMuted: false });
  assert.equal(selectMeetingParticipants(snapshot, media([microphone]), "binding")[0].microphoneMuted, false);
});

test("stale binding and reconnect suppress old tracks, shares and speaking state", () => {
  const state = media([camera(), camera({ trackSid: "share", source: "screen_share" })]);
  const current = selectMeetingParticipants(snapshot, state, "binding")[0];
  assert.equal(current.screenShares[0].id, "share");
  for (const roster of [selectMeetingParticipants(snapshot, state, "replacement"),
    selectMeetingParticipants(snapshot, { ...state, connected: false }, "binding")]) {
    assert.equal(roster[0].cameraTrack, null);
    assert.deepEqual(roster[0].screenShares, []);
    assert.equal(roster[0].speaking, false);

  }
});

test("display name and username never substitute for admitted media identity", () => {
  const state = media([camera()]);
  state.participants = [{ identity: "alice", local: false, speaking: true, publications: [camera()] }];
  assert.equal(selectMeetingParticipants(snapshot, state, "binding")[0].cameraTrack, null);
});


test("intentional media absence stays neutral while an observed reconnect is connecting", () => {
  const absent = selectMeetingParticipants(snapshot, null, "binding");
  assert.deepEqual(absent.map(person => person.mediaState), ["unavailable", "unavailable"]);
  const reconnecting = selectMeetingParticipants(snapshot, { ...media(), connected: false }, "binding");
  assert.equal(reconnecting[0].mediaState, "connecting");
  assert.equal(reconnecting[1].mediaState, "unavailable");
});
