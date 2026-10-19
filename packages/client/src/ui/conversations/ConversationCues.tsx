import type { PublicConversationSummary } from "@gammyverse/shared";
import "./Conversations.css";

const CONVERSATIONS_LABEL = "Public conversations";
const APPROACH_LABEL = "Approach";
const CURRENT_LABEL = "Your conversation";
const EMPTY_LABEL = "No public conversations are nearby yet.";
const CUE_EXPLANATION_LABEL = "Approach a conversation to reach its public area. Audio connects only after your membership is confirmed.";
export interface ConversationCuesProps {
  conversations: readonly PublicConversationSummary[];
  currentConversationId: string | null;
  pending: boolean;
  error: string | null;
  disabled?: boolean;
  onApproach(conversationId: string): void;
}
export function ConversationCues(props: ConversationCuesProps) {
  return <section className="conversation-cues" aria-label={CONVERSATIONS_LABEL}>
    <h2>{CONVERSATIONS_LABEL}</h2><p className="conversation-explanation">{CUE_EXPLANATION_LABEL}</p>
    {props.conversations.length === 0 && <p role="status">{EMPTY_LABEL}</p>}
    <ul>{props.conversations.map(conversation => <li key={conversation.id}>
      <div><strong>{conversation.name}</strong><small>{conversation.participantCount} · {conversation.participantNames.join(", ")}</small></div>
      {conversation.id === props.currentConversationId ? <span>{CURRENT_LABEL}</span> : <button type="button" disabled={props.disabled || props.pending} onClick={() => props.onApproach(conversation.id)}>{APPROACH_LABEL}</button>}
    </li>)}</ul>
    {props.error && <p role="alert">{props.error}</p>}
  </section>;
}
