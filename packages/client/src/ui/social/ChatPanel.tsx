import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { appendChatMessage, chatThreadKey } from "./socialState";
import { ChatPanelView } from "./ChatPanelView";
import { chatThreads } from "./chatPresentation";
import type { ChatMessage, ChatTransport } from "./chatTypes";
import { playSocialNotificationSound } from "../../audio/notificationSounds";

export type { ChatMessage, ChatTransport } from "./chatTypes";

interface ChatPanelProps {
  room: ChatTransport | null;
  endpoint: string;
  officeId: string;
  username: string;
  target: string | null;
  targetRevision?: number;
  visible: boolean;
  container: HTMLElement | null;
  onUnread(count: number): void;
  onNearby(message: ChatMessage): void;
}
const CHAT_HISTORY_ERROR_LABEL = "Could not load chat history.";
const CHAT_SEND_ERROR_LABEL = "Message could not be sent.";

export function ChatPanel({
  room,
  endpoint,
  officeId,
  username,
  target,
  targetRevision = 0,
  visible,
  container,
  onUnread,
  onNearby,
}: ChatPanelProps) {
  const [thread, setThread] = useState("nearby");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dmUsername, setDmUsername] = useState("");
  const [openedThreads, setOpenedThreads] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const officeRef = useRef(officeId);
  officeRef.current = officeId;
  const selectionRef = useRef({ thread, visible });
  selectionRef.current = { thread, visible };
  const selectThread = useCallback((nextThread: string) => {
    setThread(nextThread);
    setOpenedThreads((current) => [...new Set([...current, nextThread])]);
  }, []);
  useEffect(() => {
    if (target) selectThread(`dm:${target}`);
  }, [target, targetRevision, selectThread]);
  useEffect(() => {
    if (visible) setUnread((current) => ({ ...current, [thread]: 0 }));
  }, [visible, thread]);
  useEffect(() => {
    onUnread(Object.values(unread).reduce((sum, count) => sum + count, 0));
  }, [unread, onUnread]);
  useEffect(() => {
    setMessages([]);
    setUnread({});
    if (!room) return;
    const removeMessage = room.onMessage(
      "chat-message",
      (message: ChatMessage) => {
        setMessages((current) => appendChatMessage(current, message));
        const key = chatThreadKey(message, username);
        const selected = selectionRef.current;
        const unreadMessage = message.senderUsername !== username && (!selected.visible || key !== selected.thread);
        if (unreadMessage) {
          playSocialNotificationSound("chat");
          setUnread((current) => ({
            ...current,
            [key]: (current[key] ?? 0) + 1,
          }));
        }
        if (message.scope === "nearby") onNearby(message);
      },
    );
    const removeError = room.onMessage(
      "chat-error",
      (message: { error?: string }) =>
        setError(message.error ?? CHAT_SEND_ERROR_LABEL),
    );
    return () => {
      removeMessage();
      removeError();
    };
  }, [room, officeId, username, onNearby]);
  const threadMessages = messages.filter(
    (message) => chatThreadKey(message, username) === thread,
  );
  const loadHistory = useCallback(async (before?: string, signal?: AbortSignal) => {
    if (thread === "nearby") return;
    const requestedOfficeId = officeId;
    const query = new URLSearchParams({
      scope: thread.startsWith("dm:") ? "dm" : "office",
    });
    if (thread.startsWith("dm:")) query.set("with", thread.slice("dm:".length));
    if (before) query.set("before", before);
    try {
      const response = await fetch(
        `${endpoint}/offices/${officeId}/chat?${query}`,
        { credentials: "include", signal },
      );
      if (!response.ok) throw new Error(CHAT_HISTORY_ERROR_LABEL);
      const result = (await response.json()) as { messages: ChatMessage[] };
      if (signal?.aborted || officeRef.current !== requestedOfficeId) return;
      setMessages((current) =>
        result.messages
          .reduce((all, message) => appendChatMessage(all, message), current)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
      setError(null);
    } catch {
      if (!signal?.aborted && officeRef.current === requestedOfficeId)
        setError(CHAT_HISTORY_ERROR_LABEL);
    }
  }, [thread, officeId, endpoint]);
  // `room` is intentionally a trigger: history reloads after a reconnect.
  useEffect(() => {
    const abort = new AbortController();
    void loadHistory(undefined, abort.signal);
    return () => abort.abort();
  }, [loadHistory, room]);
  if (!visible || !container) return null;
  return createPortal(
    <ChatPanelView
      thread={thread}
      threads={chatThreads(messages, username, openedThreads)}
      username={username}
      unread={unread}
      messages={threadMessages}
      text={text}
      dmUsername={dmUsername}
      error={error}
      connected={Boolean(room)}
      onText={setText}
      onDmUsername={setDmUsername}
      onThread={selectThread}
      onEarlier={() => void loadHistory(threadMessages[0]?.id)}
      onSend={() => {
        if (!text.trim() || !room) return;
        room.send("chat", {
          scope: thread.startsWith("dm:") ? "dm" : thread,
          text,
          ...(thread.startsWith("dm:")
            ? { targetUsername: thread.slice("dm:".length) }
            : {}),
        });
        setText("");
      }}
    />,
    container,
  );
}
