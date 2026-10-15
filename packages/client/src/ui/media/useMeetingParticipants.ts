import { useEffect, useState } from "react";
import type { ConversationSnapshot, ConversationListeningMode } from "@gammyverse/shared";
import { conversationBindingKey } from "./conversationState";
import { selectMeetingParticipants } from "./meetingParticipantState";
import { observeMeetingRoom, type MeetingMediaState, type ObservableMeetingRoom } from "./observeMeetingRoom";
import { voiceTargetKey, type VoiceTarget } from "./voiceTarget";

export type BoundMeetingRoom = { room: ObservableMeetingRoom | null; target: VoiceTarget | null };

export function useMeetingParticipants(snapshot: ConversationSnapshot | null, bound: BoundMeetingRoom, sessionKey: string | null, localSessionId?: string, mode: ConversationListeningMode = "join") {
  const [observed, setObserved] = useState<{ room: ObservableMeetingRoom; state: MeetingMediaState } | null>(null);
  const bindingKey = sessionKey ? conversationBindingKey(snapshot, sessionKey, mode) : null;
  const boundKey = bound.target ? voiceTargetKey(bound.target) : null;
  const room = bound.room;
  useEffect(() => {
    if (!room || !boundKey || bindingKey !== boundKey) return;
    return observeMeetingRoom(room, boundKey, state => setObserved({ room, state }));
  }, [room, boundKey, bindingKey]);
  const media = observed?.room === room && bindingKey === boundKey ? observed?.state ?? null : null;
  const participants = selectMeetingParticipants(snapshot, media, bindingKey);
  return localSessionId ? participants.map(participant => ({ ...participant,
    local: snapshot?.conversation?.members.some(member => member.id === participant.memberId && member.sessionId === localSessionId) ?? false })) : participants;
}
