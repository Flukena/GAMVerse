import { availabilityPolicy, type ConversationListeningMode, type UserStatus } from "@gammyverse/shared";

export const CONVERSATION_OVERRIDE_MAX_COUNT = 64;
export const AUTO_LISTEN_STORAGE_KEY = "gamverse.auto-listen.v1";
const DEFAULT_AUTO_LISTEN = true;
export class ConversationListeningPreferences {
  private readonly overrides = new Map<string, ConversationListeningMode>();
  mode(officeId: string | null, conversationId: string | null, autoListen: boolean): ConversationListeningMode {
    if (!officeId || !conversationId) return "off";
    const existing = this.overrides.get(this.key(officeId, conversationId));
    if (existing) return existing;
    const initialMode = autoListen ? "join" : "off";
    this.setMode(officeId, conversationId, initialMode);
    return initialMode;
  }
  setMode(officeId: string, conversationId: string, mode: ConversationListeningMode): void {
    const key = this.key(officeId, conversationId);
    this.overrides.delete(key);
    this.overrides.set(key, mode);
    if (this.overrides.size > CONVERSATION_OVERRIDE_MAX_COUNT) this.overrides.delete(this.overrides.keys().next().value!);
  }
  private key(officeId: string, conversationId: string): string { return JSON.stringify([officeId, conversationId]); }
}
export function effectiveConversationMode(mode: ConversationListeningMode, status: UserStatus): ConversationListeningMode {
  return availabilityPolicy(status).suppressAutomaticMedia ? "off" : mode;
}
export function readAutoListenPreference(value: string | null): boolean {
  return value === "false" ? false : DEFAULT_AUTO_LISTEN;
}
