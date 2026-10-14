export const CHAT_MAX_TEXT_CHARS = 2_000;
export const CHAT_MAX_USERNAME_CHARS = 64;
export const CHAT_MIN_INTERVAL_MS = 500;
export const CHAT_BURST_CAP = 5;
export const CHAT_BURST_WINDOW_MS = 5_000;
export const CHAT_PAGE_SIZE = 50;
export const CHAT_RETENTION_PER_OFFICE = 10_000;
export const CHAT_BUBBLE_MS = 5_000;
export type ChatScope = "nearby" | "office" | "dm";
export type ChatSend = {
  scope: ChatScope;
  text: string;
  targetUsername?: string;
};
export type ChatMessage = {
  id: string;
  officeId: string;
  scope: ChatScope;
  senderUsername: string;
  recipientUsername?: string;
  text: string;
  createdAt: string;
};

export function normalizeChatText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}
export function isValidGatherUsername(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= CHAT_MAX_USERNAME_CHARS &&
    value === value.trim()
  );
}
export function isValidChatSend(value: unknown): value is ChatSend {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Partial<ChatSend>;
  if (p.scope !== "nearby" && p.scope !== "office" && p.scope !== "dm")
    return false;
  if (
    typeof p.text !== "string" ||
    p.text.length > CHAT_MAX_TEXT_CHARS ||
    normalizeChatText(p.text).length === 0
  )
    return false;
  return p.scope !== "dm" || isValidGatherUsername(p.targetUsername);
}
