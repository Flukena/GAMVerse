import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  appendChatMessage,
  chatThreadKey,
  dmThreadForUsername,
} from "./socialState";

export interface ChatMessage {
  id: string;
  officeId: string;
  scope: "nearby" | "office" | "dm";
  senderUsername: string;
  recipientUsername?: string;
  text: string;
  createdAt: string;
  sessionId: string;
}
export interface ChatTransport {
  send(type: string, payload: unknown): void;
  onMessage(type: string, callback: (message: never) => void): () => void;
}
interface ChatPanelProps {
  room: ChatTransport | null;
  endpoint: string;
  officeId: string;
  username: string;
  target: string | null;
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
  visible,
  container,
  onUnread,
  onNearby,
}: ChatPanelProps) {
  const [thread, setThread] = useState("nearby");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dmUsername, setDmUsername] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const officeRef = useRef(officeId);
  officeRef.current = officeId;
  const selectionRef = useRef({ thread, visible });
  selectionRef.current = { thread, visible };
  useEffect(() => {
    if (target) setThread(`dm:${target}`);
  }, [target]);
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
        if (!selected.visible || key !== selected.thread)
          setUnread((current) => ({
            ...current,
            [key]: (current[key] ?? 0) + 1,
          }));
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
  const threads = [
    "nearby",
    "office",
    ...new Set(
      messages
        .filter((message) => message.scope === "dm")
        .map((message) => chatThreadKey(message, username)),
    ),
    ...(target ? [`dm:${target}`] : []),
  ];
  return createPortal(
    <ChatPanelView
      thread={thread}
      threads={[...new Set(threads)]}
      unread={unread}
      messages={threadMessages}
      text={text}
      dmUsername={dmUsername}
      error={error}
      connected={Boolean(room)}
      onText={setText}
      onDmUsername={setDmUsername}
      onThread={setThread}
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

interface ChatViewProps {
  thread: string;
  threads: string[];
  unread: Record<string, number>;
  messages: ChatMessage[];
  text: string;
  dmUsername: string;
  error: string | null;
  connected: boolean;
  onText(text: string): void;
  onDmUsername(username: string): void;
  onThread(thread: string): void;
  onEarlier(): void;
  onSend(): void;
}
function ChatPanelView(props: ChatViewProps) {
  return (
    <section aria-label="Chat" className="gather-chat">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const targetThread = dmThreadForUsername(props.dmUsername);
          if (targetThread) props.onThread(targetThread);
        }}
      >
        <input
          aria-label="DM username (including offline members)"
          value={props.dmUsername}
          onChange={(event) => props.onDmUsername(event.target.value)}
        />
        <button>Open DM</button>
      </form>
      <nav aria-label="Chat threads">
        {props.threads.map((key) => (
          <button
            type="button"
            key={key}
            aria-pressed={props.thread === key}
            onClick={() => props.onThread(key)}
          >
            {key.startsWith("dm:") ? key.slice("dm:".length) : key}
            {props.unread[key] ? ` (${props.unread[key]})` : ""}
          </button>
        ))}
      </nav>
      {props.thread !== "nearby" && (
        <button type="button" onClick={props.onEarlier}>
          Load earlier messages
        </button>
      )}
      <ol aria-live="polite">
        {props.messages.map((message) => (
          <li key={message.id}>
            <strong>{message.senderUsername}</strong>{" "}
            <span>{message.text}</span>
          </li>
        ))}
      </ol>
      {props.error && <p role="alert">{props.error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          props.onSend();
        }}
      >
        <input
          aria-label="Message"
          value={props.text}
          onChange={(event) => props.onText(event.target.value)}
          autoComplete="off"
        />
        <button disabled={!props.connected || !props.text.trim()}>Send</button>
      </form>
    </section>
  );
}
