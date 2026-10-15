import { useId } from "react";
import type { MeetingHandsModel } from "./useMeetingHands";
import "./MeetingHands.css";

const QUEUE_LABEL = "Raised hands";
const CONTEXT_LABEL = "Queue for your current conversation, in server-confirmed order.";
const RAISE_LABEL = "Raise hand";
const LOWER_LABEL = "Lower hand";
const REFRESH_LABEL = "Refresh raised hands";
const EMPTY_LABEL = "No raised hands.";
const LOADING_LABEL = "Loading raised hands…";
const PENDING_LABEL = "Waiting for confirmation…";
const SELF_LABEL = "You";
export function MeetingHands({ model, connected = model.active }: { model: MeetingHandsModel; connected?: boolean }) {
  const id = useId();
  if (!model.active) return null;
  return <section className="meeting-hands" aria-labelledby={id} aria-busy={model.pending}>
    <header><div><h3 id={id}>{QUEUE_LABEL}</h3><p>{CONTEXT_LABEL}</p></div>
      <button type="button" disabled={!connected || !model.ready || model.pending} aria-pressed={model.raised} onClick={() => model.setRaised(!model.raised)}>{model.raised ? LOWER_LABEL : RAISE_LABEL}</button>
    </header>
    {!model.ready && <p role="status">{LOADING_LABEL}</p>}
    {model.ready && model.entries.length === 0 && <p>{EMPTY_LABEL}</p>}
    {model.entries.length > 0 && <ol role="list" aria-label={QUEUE_LABEL}>{model.entries.map(entry => <li key={`${entry.memberId}:${entry.sessionId}`} value={entry.position}>
      <span className="meeting-hand-position">{entry.position}</span><span className="meeting-hand-name">{entry.displayName}{entry.isLocal ? ` (${SELF_LABEL})` : ""}</span>
    </li>)}</ol>}
    {model.pending && model.ready && <p role="status">{PENDING_LABEL}</p>}
    {model.error && <div className="meeting-hand-error" role="alert"><p>{model.error}</p><button type="button" disabled={!connected || model.pending} onClick={model.refresh}>{REFRESH_LABEL}</button></div>}
  </section>;
}
