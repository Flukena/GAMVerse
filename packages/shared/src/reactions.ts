export const REACTION_EMOJIS = ["👍", "👏", "❤️", "😂", "🎉", "👋"] as const;
export const REACTION_MIN_INTERVAL_MS = 1_000;
export const REACTION_FLOAT_MS = 3_000;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
export type Reaction = { emoji: ReactionEmoji };
export type HandRaise = { raised: boolean };
export function isValidReaction(value: unknown): value is Reaction {
  if (typeof value !== "object" || value === null) return false;
  return REACTION_EMOJIS.includes((value as Reaction).emoji);
}
export function isValidHandRaise(value: unknown): value is HandRaise {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as HandRaise).raised === "boolean"
  );
}
export function shouldClearHandRaise(
  previousZone: string,
  nextZone: string,
  online: boolean,
): boolean {
  return !online || previousZone !== nextZone;
}
