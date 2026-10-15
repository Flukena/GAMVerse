import type { ConversationSnapshot } from "@gammyverse/shared";
import type { MeetingParticipant, MeetingVideoTrack } from "../meetings/meetingViewState";
import type { MeetingMediaParticipant, MeetingMediaState, ObservedPublication } from "./observeMeetingRoom";

const CAMERA_SOURCE = "camera";
const MICROPHONE_SOURCE = "microphone";
const SCREEN_SHARE_SOURCE = "screen_share";

function playableTrack(publication: ObservedPublication): MeetingVideoTrack | null {
  return !publication.isMuted && publication.isSubscribed ? publication.track ?? null : null;
}
function mediaFields(participant: MeetingMediaParticipant | undefined, connected: boolean): Pick<MeetingParticipant, "local" | "speaking" | "microphoneMuted" | "mediaState" | "cameraTrack" | "screenShares"> {
  if (!participant || !connected) return { local: participant?.local ?? false, speaking: false, microphoneMuted: true,
    mediaState: participant ? "connecting" : "unavailable", cameraTrack: null, screenShares: [] };
  const camera = participant.publications.find(publication => publication.source === CAMERA_SOURCE);
  const microphone = participant.publications.find(publication => publication.source === MICROPHONE_SOURCE);
  return { local: participant.local, speaking: participant.speaking, microphoneMuted: !microphone || microphone.isMuted,
    mediaState: "connected", cameraTrack: camera ? playableTrack(camera) : null,
    screenShares: participant.publications.filter(publication => publication.source === SCREEN_SHARE_SOURCE)
      .flatMap(publication => {
        const track = playableTrack(publication);
        return track ? [{ id: publication.trackSid, track }] : [];
      }) };
}

/** Admission supplies the roster; opaque transport identities supply media only. */
export function selectMeetingParticipants(snapshot: ConversationSnapshot | null, media: MeetingMediaState | null, bindingKey: string | null): MeetingParticipant[] {
  const members = snapshot?.conversation?.members ?? [];
  const currentMedia = bindingKey !== null && media?.bindingKey === bindingKey ? media : null;
  const byIdentity = new Map(currentMedia?.participants.map(participant => [participant.identity, participant]));
  return members.map(member => ({ memberId: member.id, username: member.username, displayName: member.displayName,
    characterId: member.characterId, ...mediaFields(byIdentity.get(member.mediaIdentity), currentMedia?.connected ?? false) }));
}
