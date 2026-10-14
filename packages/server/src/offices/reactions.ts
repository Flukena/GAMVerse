import { REACTION_MIN_INTERVAL_MS } from "@gammyverse/shared";
export class ReactionGate {
  private readonly sent = new Map<string, number>();
  get size() {
    return this.sent.size;
  }
  accept(id: string, now = Date.now()) {
    for (const [sessionId, time] of this.sent) {
      if (now - time >= REACTION_MIN_INTERVAL_MS) this.sent.delete(sessionId);
    }
    const previous = this.sent.get(id);
    if (previous !== undefined && now - previous < REACTION_MIN_INTERVAL_MS)
      return false;
    this.sent.set(id, now);
    return true;
  }
}
