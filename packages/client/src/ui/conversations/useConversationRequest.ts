import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationTransport } from "../media/conversationState";
import { CONVERSATION_REQUEST_TIMEOUT_MS, ConversationRequestState } from "./conversationRequest";

const REQUEST_TIMEOUT_LABEL = "Confirmation did not arrive. Check your connection and try again.";
const REQUEST_FAILED_LABEL = "Could not send this request. Please try again.";
const RECONNECT_LABEL = "Reconnect before sending this request.";
export function useConversationRequest(room: ConversationTransport | null) {
  const request = useRef(new ConversationRequestState());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<{ owner: ConversationTransport | null; pending: boolean; error: string | null }>({ owner: room, pending: false, error: null });
  const clearTimer = useCallback(() => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; }, []);
  useEffect(() => () => { request.current.reset(); clearTimer(); }, [room, clearTimer]);
  const acknowledge = useCallback((requestId: string, error: string | null = null) => {
    if (!request.current.finish(requestId)) return;
    clearTimer();
    setState({ owner: room, pending: false, error });
  }, [room, clearTimer]);
  const send = useCallback((event: string, payload: object): boolean => {
    if (!room) { setState({ owner: room, pending: false, error: RECONNECT_LABEL }); return false; }
    const requestId = crypto.randomUUID();
    if (!request.current.begin(requestId, Date.now())) return false;
    setState({ owner: room, pending: true, error: null });
    timer.current = setTimeout(() => acknowledge(requestId, REQUEST_TIMEOUT_LABEL), CONVERSATION_REQUEST_TIMEOUT_MS);
    try { room.send(event, { ...payload, requestId }); }
    catch (cause) { acknowledge(requestId, REQUEST_FAILED_LABEL); if (!(cause instanceof Error)) throw cause; return false; }
    return true;
  }, [room, acknowledge]);
  return { pending: state.owner === room && state.pending, error: state.owner === room ? state.error : null, send, acknowledge };
}
