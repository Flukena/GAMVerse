import { REACTION_EMOJIS } from "@gammyverse/shared";
import type { ChatTransport } from "./ChatPanel";
export function SocialControls({
  room,
  raised,
  nearestTitle,
}: {
  room: ChatTransport | null;
  raised: boolean;
  nearestTitle: string | null;
}) {
  return (
    <div
      className="gather-social-controls"
      aria-label="Reactions and hand raise"
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          type="button"
          key={emoji}
          aria-label={`React ${emoji}`}
          onClick={() => room?.send("reaction", { emoji })}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={raised}
        onClick={() => room?.send("hand-raise", { raised: !raised })}
      >
        {raised ? "Lower hand" : "Raise hand"}
      </button>
      {nearestTitle && <span role="status">X to open: {nearestTitle}</span>}
    </div>
  );
}
