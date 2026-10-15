import { RoomEvent } from "livekit-client";
import type { MeetingVideoTrack } from "../meetings/meetingViewState";

export interface ObservedPublication {
  trackSid: string;
  source: string;
  isMuted: boolean;
  isSubscribed: boolean;
  track?: MeetingVideoTrack;
}
export interface ObservedParticipant {
  identity: string;
  isSpeaking: boolean;
  trackPublications: ReadonlyMap<string, ObservedPublication>;
}
export interface ObservableMeetingRoom {
  state: string;
  localParticipant: ObservedParticipant;
  remoteParticipants: ReadonlyMap<string, ObservedParticipant>;
  on(event: RoomEvent, listener: () => void): unknown;
  off(event: RoomEvent, listener: () => void): unknown;
}
export type MeetingMediaParticipant = {
  identity: string;
  local: boolean;
  speaking: boolean;
  publications: readonly ObservedPublication[];
};
export type MeetingMediaState = {
  bindingKey: string;
  connected: boolean;
  participants: readonly MeetingMediaParticipant[];
};
const OBSERVED_EVENTS = [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ActiveSpeakersChanged,
  RoomEvent.ConnectionStateChanged, RoomEvent.Reconnecting, RoomEvent.Reconnected,
  RoomEvent.Disconnected, RoomEvent.TrackSubscriptionFailed, RoomEvent.TrackSubscriptionStatusChanged] as const;
const CONNECTED_STATE = "connected";

function snapshotParticipant(participant: ObservedParticipant, local: boolean): MeetingMediaParticipant {
  return { identity: participant.identity, local, speaking: participant.isSpeaking,
    publications: [...participant.trackPublications.values()].map(publication => ({
      trackSid: publication.trackSid, source: publication.source, isMuted: publication.isMuted,
      isSubscribed: local || publication.isSubscribed, track: publication.track,
    })) };
}

/** Observes the coordinator's room; disposal only detaches our listeners. */
export function observeMeetingRoom(room: ObservableMeetingRoom, bindingKey: string, changed: (state: MeetingMediaState) => void): () => void {
  let disposed = false;
  const update = () => {
    if (disposed) return;
    changed({ bindingKey, connected: room.state === CONNECTED_STATE,
      participants: [snapshotParticipant(room.localParticipant, true),
        ...[...room.remoteParticipants.values()].map(participant => snapshotParticipant(participant, false))] });
  };
  for (const event of OBSERVED_EVENTS) room.on(event, update);
  update();
  return () => {
    disposed = true;
    for (const event of OBSERVED_EVENTS) room.off(event, update);
  };
}
