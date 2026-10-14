import { useEffect, useId, useReducer, useRef } from "react";
import { REACTION_EMOJIS } from "@gammyverse/shared";
import type { ChatTransport } from "./ChatPanel";
import { reactionPickerOpen } from "./reactionPickerState";

const REACTIONS_LABEL = "Reactions";
const REACTION_BUTTON_SELECTOR = ".reaction-picker-popover button";

export function ReactionPicker({ room, disabled = false }: {
  room: ChatTransport | null;
  disabled?: boolean;
}) {
  const [open, dispatch] = useReducer(reactionPickerOpen, false);
  const controlRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const unavailable = disabled || !room;
  useEffect(() => { dispatch("outside"); }, [room, disabled]);
  useEffect(() => {
    if (!open) return;
    controlRef.current?.querySelector<HTMLButtonElement>(REACTION_BUTTON_SELECTOR)?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !controlRef.current?.contains(event.target)) dispatch("outside");
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const select = (emoji: typeof REACTION_EMOJIS[number]) => {
    room?.send("reaction", { emoji });
    dispatch("select");
    triggerRef.current?.focus();
  };
  return (
    <div ref={controlRef} className="reaction-picker-control"
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) dispatch("blur"); }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        dispatch("escape");
        triggerRef.current?.focus();
      }}>
      <button ref={triggerRef} type="button" className={`dock-button${open ? " active" : ""}`}
        aria-label={REACTIONS_LABEL} title={REACTIONS_LABEL} aria-expanded={open && !unavailable}
        aria-controls={popoverId} disabled={unavailable} onClick={() => dispatch("toggle")}>
        <span aria-hidden="true">😊</span>
      </button>
      {open && !unavailable && <div id={popoverId} className="reaction-picker-popover" role="group" aria-label={REACTIONS_LABEL}>
        {REACTION_EMOJIS.map((emoji) => <button type="button" key={emoji} className="dock-button"
          aria-label={`React ${emoji}`} onClick={() => select(emoji)}>{emoji}</button>)}
      </div>}
    </div>
  );
}
