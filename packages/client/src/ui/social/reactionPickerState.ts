export type ReactionPickerEvent = "toggle" | "select" | "escape" | "outside" | "blur";

export function reactionPickerOpen(open: boolean, event: ReactionPickerEvent): boolean {
  return event === "toggle" && !open;
}
