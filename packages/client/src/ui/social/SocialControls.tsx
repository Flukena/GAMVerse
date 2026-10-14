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
      aria-label="Hand raise and interaction"
    >
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
