import { chatThreadKey, type ChatThreadMessage } from "./socialState";

const DM_THREAD_PREFIX = "dm:";
const IME_CONFIRM_KEY_CODE = 229;

export function chatThreads(
  messages: readonly ChatThreadMessage[],
  username: string,
  openedThreads: readonly string[],
): string[] {
  const directMessages = messages
    .filter((message) => message.scope === "dm")
    .map((message) => chatThreadKey(message, username));
  return [...new Set([
    "nearby", "office",
    ...openedThreads.filter((thread) => thread.startsWith(DM_THREAD_PREFIX)),
    ...directMessages,
  ])];
}

export function chatThreadLabel(thread: string): string {
  if (thread === "nearby") return "Nearby";
  if (thread === "office") return "Office";
  return thread.slice(DM_THREAD_PREFIX.length);
}

export function shouldSendChatOnEnter(
  key: string,
  shiftKey: boolean,
  isComposing: boolean,
  keyCode: number,
): boolean {
  return key === "Enter" && !shiftKey && !isComposing && keyCode !== IME_CONFIRM_KEY_CODE;
}
