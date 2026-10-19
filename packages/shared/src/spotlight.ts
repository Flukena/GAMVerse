import { isValidGatherUsername } from "./chat.js";

export const SPOTLIGHT_REVOKE_DEADLINE_MS = 2_000;

export type SpotlightRequest = {
  id: string;
  fromUsername: string;
  targetUsername: string;
  expiresAtMs: number;
};

export type SpotlightCommand =
  | { action: "request"; targetUsername: string }
  | { action: "respond"; requestId: string; accept: boolean }
  | { action: "cancel"; requestId: string }
  | { action: "stop"; targetUsername: string };

export function isValidSpotlightCommand(value: unknown): value is SpotlightCommand {
  if (typeof value !== "object" || value === null) return false;
  const command = value as Partial<SpotlightCommand>;
  if (command.action === "request" || command.action === "stop")
    return isValidGatherUsername(command.targetUsername);
  if (command.action === "respond")
    return typeof command.requestId === "string" && command.requestId.length >= 8
      && command.requestId.length <= 128 && typeof command.accept === "boolean";
  if (command.action === "cancel")
    return typeof command.requestId === "string" && command.requestId.length >= 8
      && command.requestId.length <= 128;
  return false;
}
