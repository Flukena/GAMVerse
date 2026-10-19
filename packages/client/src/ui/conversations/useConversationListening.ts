import { useCallback, useRef, useState } from "react";
import type { ConversationListeningMode, UserStatus } from "@gammyverse/shared";
import { AUTO_LISTEN_STORAGE_KEY, ConversationListeningPreferences, effectiveConversationMode, readAutoListenPreference } from "./conversationListening";

function readPreference(): boolean {
  try { return readAutoListenPreference(window.localStorage.getItem(AUTO_LISTEN_STORAGE_KEY)); }
  catch (cause) { if (!(cause instanceof DOMException)) throw cause; return readAutoListenPreference(null); }
}
export function useConversationListening({ officeId, conversationId, status }: {
  officeId: string | null; conversationId: string | null; status: UserStatus;
}) {
  const preferences = useRef(new ConversationListeningPreferences());
  const [autoListen, setAutoListenState] = useState(readPreference);
  const [, update] = useState(0);
  const mode = preferences.current.mode(officeId, conversationId, autoListen);
  const setMode = useCallback((next: ConversationListeningMode) => {
    if (!officeId || !conversationId || effectiveConversationMode(next, status) !== next) return;
    preferences.current.setMode(officeId, conversationId, next);
    update(value => value + 1);
  }, [officeId, conversationId, status]);
  const setAutoListen = useCallback((enabled: boolean) => {
    if (autoListen === enabled) return;
    try { window.localStorage.setItem(AUTO_LISTEN_STORAGE_KEY, String(enabled)); }
    catch (cause) { if (!(cause instanceof DOMException)) throw cause; }
    setAutoListenState(enabled);
  }, [autoListen]);
  return { mode, effectiveMode: effectiveConversationMode(mode, status), autoListen, setMode, setAutoListen };
}
