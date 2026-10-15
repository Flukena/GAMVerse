const COMMAND_SHORTCUT_KEY = "k";

type CommandShortcutEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  repeat: boolean;
  isComposing: boolean;
};

export function isCommandPaletteShortcut(event: CommandShortcutEvent, enabled: boolean, otherDialogOpen: boolean) {
  if (!enabled || otherDialogOpen || event.repeat || event.isComposing || event.altKey) return false;
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === COMMAND_SHORTCUT_KEY;
}


type CommandModalState = {
  nativeOpen: boolean;
  role: string | null;
  ariaModal: string | null;
  isCommandPalette: boolean;
};

export function blocksCommandPalette(modal: CommandModalState) {
  const semanticModal = modal.role === "dialog" && modal.ariaModal === "true";
  return !modal.isCommandPalette && (modal.nativeOpen || semanticModal);
}
