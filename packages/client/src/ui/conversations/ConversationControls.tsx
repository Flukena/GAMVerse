import { useId } from "react";
import type { ConversationListeningMode } from "@gammyverse/shared";
import "./Conversations.css";

const CONTROLS_LABEL = "Conversation participation";
const LISTEN_LABEL = "Listen";
const JOIN_LABEL = "Join";
const MUTE_LABEL = "Mute conversation";
const AUTO_JOIN_LABEL = "Automatically join conversations";
const LISTEN_EXPLANATION_LABEL = "Listening with microphone and camera off. Join before turning them on.";
const JOIN_EXPLANATION_LABEL = "Joined. Your microphone and camera stay off until you turn them on.";
const OFF_EXPLANATION_LABEL = "Conversation audio is off. Your office presence stays visible.";
export interface ConversationControlsProps {
  conversationId: string | null;
  mode: ConversationListeningMode;
  effectiveMode: ConversationListeningMode;
  autoListen: boolean;
  connected: boolean;
  disabledReason?: string | null;
  pending?: boolean;
  error?: string | null;
  compact?: boolean;
  onModeChange(mode: ConversationListeningMode): void;
  onAutoListenChange(enabled: boolean): void;
}
export function ConversationControls(props: ConversationControlsProps) {
  const id = useId();
  const disabled = !props.connected || !props.conversationId || props.pending;
  const explanation = props.effectiveMode === "listen" ? LISTEN_EXPLANATION_LABEL : props.effectiveMode === "join" ? JOIN_EXPLANATION_LABEL : OFF_EXPLANATION_LABEL;
  return <section className={`conversation-controls${props.compact ? " is-compact" : ""}`} aria-label={CONTROLS_LABEL}>
    <div className="conversation-mode-buttons" role="group" aria-label={CONTROLS_LABEL}>
      <button type="button" disabled={disabled || Boolean(props.disabledReason)} aria-pressed={props.effectiveMode === "listen"} onClick={() => props.onModeChange("listen")}>{LISTEN_LABEL}</button>
      <button type="button" disabled={disabled || Boolean(props.disabledReason)} aria-pressed={props.effectiveMode === "join"} onClick={() => props.onModeChange("join")}>{JOIN_LABEL}</button>
      <button type="button" disabled={disabled} aria-pressed={props.effectiveMode === "off"} onClick={() => props.onModeChange("off")}>{MUTE_LABEL}</button>
    </div>
    <label className="conversation-auto-listen" htmlFor={id}><input id={id} type="checkbox" checked={props.autoListen} onChange={event => props.onAutoListenChange(event.target.checked)} />{AUTO_JOIN_LABEL}</label>
    <p className="conversation-explanation">{props.disabledReason || explanation}</p>
    {props.error && <p role="alert">{props.error}</p>}
  </section>;
}
