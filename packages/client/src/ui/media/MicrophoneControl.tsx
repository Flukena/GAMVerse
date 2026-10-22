import { FeatherIcon } from "../FeatherIcon";
import { microphoneControlState, type MicrophoneControlInput } from "./microphoneControlState";

type MicrophoneControlProps = MicrophoneControlInput & { onToggle(): void };

export function MicrophoneControl(props: MicrophoneControlProps) {
  const state = microphoneControlState(props);
  return <button data-tutorial-target="office-microphone" type="button"
    className={`dock-button${props.desiredMuted ? "" : " active"}${state.pending ? " microphone-pending" : ""}`}
    title={state.title} aria-label={state.action} aria-pressed={!props.desiredMuted} onClick={props.onToggle}>
    <FeatherIcon name={props.desiredMuted ? "micOff" : "mic"} />
    {state.pending && <span className="microphone-pending-indicator" aria-hidden="true">◷</span>}
  </button>;
}
