import { useCallback, useEffect, useState } from "react";
import { blocksCommandPalette, isCommandPaletteShortcut } from "./commandPaletteShortcut";

const DIALOG_SELECTOR = "dialog, [role=dialog]";
const NATIVE_OPEN_DIALOG_SELECTOR = "dialog[open]";
const COMMAND_PALETTE_CLASS = "command-palette";
const COMMAND_INPUT_SELECTOR = ".command-palette input[type=search]";

export function useCommandPalette(enabled = true) {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => { if (enabled) setOpen(true); }, [enabled]);
  const closePalette = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const otherDialogOpen = [...document.querySelectorAll(DIALOG_SELECTOR)].some((dialog) => blocksCommandPalette({
        nativeOpen: dialog.matches(NATIVE_OPEN_DIALOG_SELECTOR),
        role: dialog.getAttribute("role"),
        ariaModal: dialog.getAttribute("aria-modal"),
        isCommandPalette: dialog.classList.contains(COMMAND_PALETTE_CLASS),
      }));
      if (!isCommandPaletteShortcut(event, enabled, otherDialogOpen)) return;
      event.preventDefault();
      event.stopPropagation();
      if (open) document.querySelector<HTMLInputElement>(COMMAND_INPUT_SELECTOR)?.focus();
      else setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, open]);
  return { open: enabled && open, openPalette, closePalette };
}
