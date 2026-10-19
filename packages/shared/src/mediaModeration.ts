import { normalizeAccountUsername } from "./accountUsername.js";
import { conversationRecord, conversationText } from "./conversationValidation.js";

const OFFICE_ID_MAX_CHARACTERS = 512;
export type VoiceModerationSource = "microphone" | "camera" | "screen_share";
export type VoiceModerationRequest = { officeId: string; source: VoiceModerationSource; all?: boolean; targetUsername?: string };
export function isVoiceModerationRequest(value: unknown): value is VoiceModerationRequest {
  if (!conversationRecord(value) || !conversationText(value.officeId, OFFICE_ID_MAX_CHARACTERS)
    || (value.source !== "microphone" && value.source !== "camera" && value.source !== "screen_share")) return false;
  if (value.all !== undefined && typeof value.all !== "boolean") return false;
  if (value.targetUsername !== undefined && (typeof value.targetUsername !== "string" || normalizeAccountUsername(value.targetUsername) !== value.targetUsername)) return false;
  return value.all === true || typeof value.targetUsername === "string";
}
