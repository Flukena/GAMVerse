export const CONVERSATION_REQUEST_TIMEOUT_MS = 15_000;
export type ConversationPendingRequest = { requestId: string; deadlineMs: number };
export class ConversationRequestState {
  pending: ConversationPendingRequest | null = null;
  begin(requestId: string, nowMs: number): boolean {
    if (this.pending) return false;
    this.pending = { requestId, deadlineMs: nowMs + CONVERSATION_REQUEST_TIMEOUT_MS };
    return true;
  }
  finish(requestId: string): boolean {
    if (this.pending?.requestId !== requestId) return false;
    this.pending = null;
    return true;
  }
  reset(): void { this.pending = null; }
}
