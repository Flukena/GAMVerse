import { useCallback, useEffect, useMemo, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { MEETING_HANDS_REQUEST_EVENT, MEETING_HAND_COMMAND_EVENT, type ConversationSnapshot, type MeetingHandsSnapshot } from "@gammyverse/shared";
import type { ConversationTransport } from "../media/conversationState";
import { useConversationRequest } from "../conversations/useConversationRequest";
import { MeetingHandState, observeMeetingHands, selectMeetingHands } from "./meetingHandState";

const HAND_REQUEST_FAILED_LABEL = "Could not update your raised hand. Refresh the queue and try again.";
export function useMeetingHands(room: Room | null, conversation: ConversationSnapshot | null, transportKey: string | null) {
  const officeId = conversation?.officeId;
  const roomIncarnationId = conversation?.roomIncarnationId;
  const conversationId = conversation?.conversation?.id;
  const sessionId = room?.sessionId;
  const admitted = Boolean(sessionId && conversation?.conversation?.members.some(member => member.sessionId === sessionId));
  const owner = useMemo(() => room && officeId && roomIncarnationId && conversationId && sessionId && transportKey && admitted
    ? new MeetingHandState({ officeId, roomIncarnationId, conversationId, sessionId, transportKey }) : null,
  [room, officeId, roomIncarnationId, conversationId, sessionId, transportKey, admitted]);
  const scopeRoom = useMemo<ConversationTransport | null>(() => room && owner ? {
    onMessage: (event, callback) => room.onMessage(event, callback), send: (event, payload) => room.send(event, payload),
  } : null, [room, owner]);
  const request = useConversationRequest(scopeRoom);
  const [accepted, setAccepted] = useState<{ owner: MeetingHandState; snapshot: MeetingHandsSnapshot } | null>(null);
  const context = useMemo(() => owner ? { officeId: owner.context.officeId, roomIncarnationId: owner.context.roomIncarnationId, conversationId: owner.context.conversationId } : null, [owner]);
  const refresh = useCallback(() => context ? request.send(MEETING_HANDS_REQUEST_EVENT, context) : false, [context, request.send]);
  useEffect(() => {
    if (!owner || !scopeRoom) return;
    const dispose = observeMeetingHands(owner, scopeRoom, {
      snapshotChanged: snapshot => setAccepted({ owner, snapshot }),
      resultReceived: result => request.acknowledge(result.requestId, result.ok ? null : result.error || HAND_REQUEST_FAILED_LABEL),
    });
    refresh();
    return dispose;
  }, [owner, scopeRoom, refresh, request.acknowledge]);
  const snapshot = accepted?.owner === owner ? accepted.snapshot : null;
  const entries = selectMeetingHands(snapshot, conversation, sessionId ?? null);
  const raised = entries.some(entry => entry.isLocal);
  const setRaised = (nextRaised: boolean): boolean => {
    if (!context || !snapshot || nextRaised === raised) return false;
    return request.send(MEETING_HAND_COMMAND_EVENT, { ...context, raised: nextRaised });
  };
  return { entries, raised, pending: request.pending, error: request.error, ready: snapshot !== null, active: owner !== null, conversationId: conversationId ?? null, setRaised, refresh };
}
export type MeetingHandsModel = ReturnType<typeof useMeetingHands>;
