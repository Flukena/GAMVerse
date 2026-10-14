import { isValidGatherUsername } from "./chat.js";
export const SPOTLIGHT_REVOKE_DEADLINE_MS = 2_000;
export type SpotlightCommand = { targetUsername: string; on: boolean };
export function isValidSpotlightCommand(
  value: unknown,
): value is SpotlightCommand {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Partial<SpotlightCommand>;
  return isValidGatherUsername(p.targetUsername) && typeof p.on === "boolean";
}
