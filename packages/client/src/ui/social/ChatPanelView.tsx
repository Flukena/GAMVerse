import { useEffect, useRef, type RefObject } from "react";
import type { ChatMessage } from "./chatTypes";
import { chatThreadLabel, shouldSendChatOnEnter } from "./chatPresentation";
import { dmThreadForUsername } from "./socialState";

const CHAT_SCROLL_BOTTOM_THRESHOLD_PX = 64;
const CHAT_COMPOSER_ROWS = 2;
const CHAT_TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const CHAT_SCOPE_THREADS = ["nearby", "office"];
const CHAT_LABELS = {
  nearbyAudience: "People in your current conversation. Nearby messages are temporary.",
  officeAudience: "Everyone in this office, including members who are offline.",
  directAudience: "A private conversation with",
  nearbyEmpty: "Say hello to the people around you.",
  officeEmpty: "Share an update with your office.",
  directEmpty: "Start a private conversation.",
  disconnected: "Reconnecting… Your draft is saved here. Sending will resume when connected.",
  composerHint: "Enter to send · Shift + Enter for a new line",
};

export interface ChatViewProps {
  thread: string;
  threads: string[];
  username: string;
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

function ThreadButton({ thread, selected, unread, onSelect }: {
  thread: string; selected: string; unread: number; onSelect(thread: string): void;
}) {
  return <button type="button" className="chat-thread" aria-pressed={selected === thread}
    onClick={() => onSelect(thread)}>
    <span>{chatThreadLabel(thread)}</span>
    {unread > 0 && <span className="chat-unread" aria-label={`${unread} unread messages`}>{unread}</span>}
  </button>;
}

function ChatConversations(props: ChatViewProps & { onDirectThread(thread: string): void }) {
  const newDirectRef = useRef<HTMLDetailsElement>(null);
  const directThreads = props.threads.filter((thread) => thread.startsWith("dm:"));
  return <>
    <nav className="chat-scopes" aria-label="Chat channels">
      {CHAT_SCOPE_THREADS.map((thread) => <ThreadButton key={thread} thread={thread}
        selected={props.thread} unread={props.unread[thread] ?? 0} onSelect={props.onThread} />)}
    </nav>
    <div className="chat-direct-header">
      <span>Direct messages</span>
      <details ref={newDirectRef} className="chat-new-direct">
        <summary aria-label="Start a direct message">＋ New</summary>
        <form onSubmit={(event) => {
          event.preventDefault();
          const nextThread = dmThreadForUsername(props.dmUsername);
          if (nextThread) {
            if (newDirectRef.current) newDirectRef.current.open = false;
            props.onDirectThread(nextThread);
            props.onDmUsername("");
          }
        }}>
          <label>Member username
            <input aria-label="DM username (including offline members)" placeholder="Enter username"
              value={props.dmUsername} onChange={(event) => props.onDmUsername(event.target.value)} />
          </label>
          <button type="submit" disabled={!dmThreadForUsername(props.dmUsername)}>Open</button>
          <small>You can message offline office members.</small>
        </form>
      </details>
    </div>
    {directThreads.length > 0 && <nav className="chat-direct-threads" aria-label="Direct conversations">
      {directThreads.map((thread) => <ThreadButton key={thread} thread={thread}
        selected={props.thread} unread={props.unread[thread] ?? 0} onSelect={props.onThread} />)}
    </nav>}
  </>;
}

function conversationDescription(thread: string) {
  if (thread === "nearby") return CHAT_LABELS.nearbyAudience;
  if (thread === "office") return CHAT_LABELS.officeAudience;
  return `${CHAT_LABELS.directAudience} ${chatThreadLabel(thread)}.`;
}
function emptyDescription(thread: string) {
  if (thread === "nearby") return CHAT_LABELS.nearbyEmpty;
  return thread === "office" ? CHAT_LABELS.officeEmpty : CHAT_LABELS.directEmpty;
}
function MessageItem({ message, username }: { message: ChatMessage; username: string }) {
  const time = new Date(message.createdAt);
  const own = message.senderUsername === username;
  return <li className={`chat-message${own ? " chat-message-own" : ""}`}>
    <div className="chat-message-meta">
      <strong>{own ? "You" : message.senderUsername}</strong>
      {!Number.isNaN(time.getTime()) && <time dateTime={message.createdAt} title={time.toLocaleString()}>
        {CHAT_TIME_FORMAT.format(time)}
      </time>}
    </div>
    <p>{message.text}</p>
  </li>;
}

function ChatMessages(props: ChatViewProps) {
  const scrollRef = useRef<HTMLOListElement>(null);
  const nearBottomRef = useRef(true);
  const previousThreadRef = useRef(props.thread);
  const latestMessage = props.messages.at(-1);
  const latestMessageId = latestMessage?.id;
  const latestSender = latestMessage?.senderUsername;
  useEffect(() => {
    const list = scrollRef.current;
    const switchedThread = previousThreadRef.current !== props.thread;
    previousThreadRef.current = props.thread;
    if (list && (switchedThread || nearBottomRef.current || latestSender === props.username)) {
      list.scrollTop = list.scrollHeight;
      nearBottomRef.current = true;
    }
  }, [props.thread, latestMessageId, latestSender, props.username]);
  return <ol ref={scrollRef} className="chat-messages" aria-label="Messages" aria-live="polite"
    onScroll={(event) => {
      const list = event.currentTarget;
      nearBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < CHAT_SCROLL_BOTTOM_THRESHOLD_PX;
    }}>
    {props.thread !== "nearby" && <li className="chat-history-action">
      <button type="button" onClick={props.onEarlier}>Load earlier messages</button>
    </li>}
    {props.messages.length === 0 && <li className="chat-empty"><span aria-hidden="true">◌</span>
      <strong>No messages yet</strong><p>{emptyDescription(props.thread)}</p></li>}
    {props.messages.map((message) => <MessageItem key={message.id} message={message} username={props.username} />)}
  </ol>;
}

function ChatComposer(props: ChatViewProps & { inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const canSend = props.connected && props.text.trim().length > 0;
  return <form className="chat-composer" onSubmit={(event) => {
    event.preventDefault();
    if (canSend) props.onSend();
  }}>
    <textarea ref={props.inputRef} aria-label={`Message ${chatThreadLabel(props.thread)}`} rows={CHAT_COMPOSER_ROWS}
      placeholder={`Message ${chatThreadLabel(props.thread)}…`} value={props.text}
      onChange={(event) => props.onText(event.target.value)}
      onKeyDown={(event) => {
        if (shouldSendChatOnEnter(event.key, event.shiftKey, event.nativeEvent.isComposing, event.keyCode)) {
          event.preventDefault();
          if (canSend) props.onSend();
        }
      }} />
    <div className="chat-composer-footer"><small>{CHAT_LABELS.composerHint}</small>
      <button type="submit" disabled={!canSend}>Send <span aria-hidden="true">↑</span></button>
    </div>
  </form>;
}

export function ChatPanelView(props: ChatViewProps) {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  return <section aria-label="Chat" className="gather-chat">
    <ChatConversations {...props} onDirectThread={(thread) => { props.onThread(thread); composerRef.current?.focus(); }} />
    <div className="chat-audience"><strong>{chatThreadLabel(props.thread)}</strong>
      <p>{conversationDescription(props.thread)}</p></div>
    <ChatMessages {...props} />
    {props.error && <p className="chat-feedback" role="alert">{props.error}</p>}
    {!props.connected && <p className="chat-feedback" role="status">{CHAT_LABELS.disconnected}</p>}
    <ChatComposer {...props} inputRef={composerRef} />
  </section>;
}
