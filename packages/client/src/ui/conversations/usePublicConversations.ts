import { useEffect, useMemo, useState } from "react";
import { APPROACH_CONVERSATION_EVENT, APPROACH_CONVERSATION_RESULT_EVENT, PUBLIC_CONVERSATIONS_EVENT, PUBLIC_CONVERSATIONS_REQUEST_EVENT, type PublicConversationsSnapshot } from "@gammyverse/shared";
import type { ConversationTransport } from "../media/conversationState";
import { PublicConversationState } from "./publicConversationState";
import { useConversationRequest } from "./useConversationRequest";

const APPROACH_UNAVAILABLE_LABEL = "This conversation is no longer reachable. Please try another public conversation.";

export function usePublicConversations(room: ConversationTransport | null, officeId: string | null, transportKey: string | null, roomIncarnationId?: string) {
  const owner = useMemo(() => room && officeId && transportKey ? new PublicConversationState(officeId, roomIncarnationId) : null, [room, officeId, transportKey, roomIncarnationId]);
  const [accepted, setAccepted] = useState<{ owner: PublicConversationState; snapshot: PublicConversationsSnapshot } | null>(null);
  const request = useConversationRequest(room);
  useEffect(() => {
    if (!room || !owner) return;
    let active = true;
    const disposeSnapshot = room.onMessage(PUBLIC_CONVERSATIONS_EVENT, payload => {
      if (active && owner.receive(payload) && owner.snapshot) setAccepted({ owner, snapshot: owner.snapshot });
    });
    const disposeTravel = room.onMessage(APPROACH_CONVERSATION_RESULT_EVENT, payload => {
      if (!active) return;
      if (typeof payload !== "object" || payload === null || !("requestId" in payload) || typeof payload.requestId !== "string") return;
      if (!("status" in payload) || !["started", "arrived", "unreachable"].includes(String(payload.status))) return;
      const error = payload.status === "unreachable" ? ("message" in payload && typeof payload.message === "string" ? payload.message : APPROACH_UNAVAILABLE_LABEL) : null;
      request.acknowledge(payload.requestId, error);
    });
    room.send(PUBLIC_CONVERSATIONS_REQUEST_EVENT, {});
    return () => { active = false; disposeSnapshot(); disposeTravel(); };
  }, [room, owner, request.acknowledge]);
  const conversations = accepted?.owner === owner ? accepted.snapshot.conversations : [];
  const approach = (conversationId: string) => {
    if (!conversations.some(conversation => conversation.id === conversationId)) return false;
    return request.send(APPROACH_CONVERSATION_EVENT, { conversationId });
  };
  return { conversations, pending: request.pending, error: request.error, approach };
}
