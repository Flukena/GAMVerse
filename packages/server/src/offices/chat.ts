import { randomUUID } from "node:crypto";
import {
  CHAT_MIN_INTERVAL_MS,
  CHAT_BURST_CAP,
  CHAT_BURST_WINDOW_MS,
  isValidChatSend,
  normalizeChatText,
  type ChatSend,
  type ChatMessage,
} from "@gammyverse/shared";
export type ChatPerson = {
  sessionId: string;
  username: string;
  channel: string;
};
export function resolveChatRecipients(
  scope: ChatSend["scope"],
  senderId: string,
  people: ChatPerson[],
  target?: string,
) {
  const sender = people.find((person) => person.sessionId === senderId);
  if (!sender) return [];
  return people
    .filter(
      (person) =>
        scope === "office" ||
        (scope === "dm"
          ? person.username === sender.username || person.username === target
          : person.channel === sender.channel),
    )
    .map((person) => person.sessionId);
}
export class ChatRateLimiter {
  private readonly sends = new Map<string, number[]>();
  get size() {
    return this.sends.size;
  }
  accept(username: string, now = Date.now()) {
    for (const [user, times] of this.sends) {
      if (now - times[times.length - 1]! >= CHAT_BURST_WINDOW_MS)
        this.sends.delete(user);
    }
    const recent = (this.sends.get(username) ?? []).filter(
      (at) => now - at < CHAT_BURST_WINDOW_MS,
    );
    const last = recent.at(-1);
    if (last !== undefined && now - last < CHAT_MIN_INTERVAL_MS) return false;
    if (recent.length >= CHAT_BURST_CAP) return false;
    recent.push(now);
    this.sends.set(username, recent);
    return true;
  }
}
type ChatDependencies = {
  role: (user: string) => Promise<string | null>;
  persist: (message: ChatMessage) => Promise<{ id: string; createdAt: string }>;
  people: () => ChatPerson[];
  now?: () => number;
  deliver: (
    sessionId: string,
    message: ChatMessage & {
      sessionId: string;
    },
  ) => void;
};
export class OfficeChat {
  private readonly limiter = new ChatRateLimiter();
  constructor(
    private readonly officeId: string,
    private readonly dependencies: ChatDependencies,
  ) {}
  async send(sessionId: string, username: string, payload: unknown) {
    if (!isValidChatSend(payload)) throw new Error("Invalid chat message.");
    if (!this.limiter.accept(username, this.dependencies.now?.()))
      throw new Error("Chat rate limit exceeded.");
    if (!(await this.dependencies.role(username)))
      throw new Error("Office access denied.");
    if (
      payload.scope === "dm" &&
      !(await this.dependencies.role(payload.targetUsername!))
    )
      throw new Error("Recipient is not an office member.");
    const message: ChatMessage = {
      id: payload.scope === "nearby" ? randomUUID() : "",
      officeId: this.officeId,
      scope: payload.scope,
      senderUsername: username,
      ...(payload.scope === "dm"
        ? { recipientUsername: payload.targetUsername }
        : {}),
      text: normalizeChatText(payload.text),
      createdAt: new Date().toISOString(),
    };
    if (payload.scope !== "nearby")
      Object.assign(message, await this.dependencies.persist(message));
    for (const id of resolveChatRecipients(
      payload.scope,
      sessionId,
      this.dependencies.people(),
      payload.targetUsername,
    ))
      this.dependencies.deliver(id, { ...message, sessionId });
  }
}
