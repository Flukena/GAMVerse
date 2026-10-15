/** Rendering attaches video elements only; the existing media coordinator owns tracks and audio. */
export interface MeetingVideoTrack {
  attach(element: HTMLMediaElement): unknown;
  detach(element: HTMLMediaElement): unknown;
}
export type MeetingScreenShare = { id: string; track: MeetingVideoTrack; label?: string };
/** Only the authoritative conversation adapter constructs this admitted roster. */
export type MeetingParticipant = {
  memberId: string;
  username: string;
  displayName: string;
  characterId?: string;
  local: boolean;
  speaking: boolean;
  microphoneMuted: boolean;
  mediaState: "connected" | "connecting" | "unavailable";
  cameraTrack: MeetingVideoTrack | null;
  screenShares: readonly MeetingScreenShare[];
};
export type MeetingViewState = {
  layout: "grid" | "speaker";
  pinnedMemberId: string | null;
  selectedShareId: string | null;
};
export type MeetingStage =
  | { kind: "participant"; participant: MeetingParticipant }
  | { kind: "share"; participant: MeetingParticipant; share: MeetingScreenShare };

export function sortMeetingParticipants(participants: readonly MeetingParticipant[]): MeetingParticipant[] {
  return [...participants].sort((a, b) => {
    if (a.memberId < b.memberId) return -1;
    return a.memberId === b.memberId ? 0 : 1;
  });
}
export function reconcileMeetingViewState(state: MeetingViewState, participants: readonly MeetingParticipant[]): MeetingViewState {
  const pinnedMemberId = participants.some(person => person.memberId === state.pinnedMemberId) ? state.pinnedMemberId : null;
  const selectedShareId = participants.some(person => person.screenShares.some(share => share.id === state.selectedShareId)) ? state.selectedShareId : null;
  if (state.pinnedMemberId === pinnedMemberId && state.selectedShareId === selectedShareId) return state;
  return { ...state, pinnedMemberId, selectedShareId };
}
function findSelectedShare(participants: readonly MeetingParticipant[], selectedShareId: string | null): MeetingStage | null {
  if (!selectedShareId) return null;
  for (const participant of participants) {
    const share = participant.screenShares.find(item => item.id === selectedShareId);
    if (share) return { kind: "share", participant, share };
  }
  return null;
}
function activeSpeaker(participants: readonly MeetingParticipant[]): MeetingParticipant | undefined {
  const ordered = sortMeetingParticipants(participants);
  return ordered.find(person => person.speaking && !person.local) ?? ordered.find(person => person.speaking) ??
    ordered.find(person => !person.local) ?? ordered[0];
}
export function resolveMeetingStage(participants: readonly MeetingParticipant[], state: MeetingViewState): MeetingStage | null {
  const share = findSelectedShare(participants, state.selectedShareId);
  if (share) return share;
  const pinned = participants.find(person => person.memberId === state.pinnedMemberId);
  if (pinned) return { kind: "participant", participant: pinned };
  if (state.layout === "grid") return null;
  const speaker = activeSpeaker(participants);
  return speaker ? { kind: "participant", participant: speaker } : null;
}
