import type { ChatTransport } from "./ChatPanel";

const RAISE_HAND_LABEL = "Raise hand";
const LOWER_HAND_LABEL = "Lower hand";

export function HandRaiseButton({ room, raised, disabled = false }: {
  room: ChatTransport | null;
  raised: boolean;
  disabled?: boolean;
}) {
  const label = raised ? LOWER_HAND_LABEL : RAISE_HAND_LABEL;
  return (
    <button type="button" className={`dock-button${raised ? " active" : ""}`}
      aria-label={label} title={label} aria-pressed={raised} disabled={disabled || !room}
      onClick={() => room?.send("hand-raise", { raised: !raised })}>
      <span aria-hidden="true">✋</span>
    </button>
  );
}
