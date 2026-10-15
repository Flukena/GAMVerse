import { CONVERSATION_MEMBERS_MAX_COUNT, type Conversation, type ConversationMember, type MeetingHandEntry } from "@gammyverse/shared";

type HandQueue = { revision: number; nextSequence: number; entries: MeetingHandEntry[] };

/** Owns FIFO order; identity and membership come exclusively from the room projection. */
export class MeetingHands {
  private readonly queues = new Map<string, HandQueue>();
  private readonly members = new Map<string, readonly ConversationMember[]>();
  private revision = 0;

  reconcile(conversations: readonly Conversation[]): Set<string> {
    const changed = new Set<string>();
    this.members.clear();
    for (const conversation of conversations) {
      this.members.set(conversation.id, conversation.members);
      const queue = this.queues.get(conversation.id);
      if (!queue) {
        this.queues.set(conversation.id, { revision: ++this.revision, nextSequence: 0, entries: [] });
        changed.add(conversation.id);
        continue;
      }
      const entries = queue.entries.filter(entry => conversation.members.some(member => member.id === entry.memberId && member.sessionId === entry.sessionId));
      if (entries.length !== queue.entries.length) {
        queue.entries = entries;
        queue.revision = ++this.revision;
        changed.add(conversation.id);
      }
    }
    for (const id of this.queues.keys()) {
      if (this.members.has(id)) continue;
      this.queues.delete(id);
      changed.add(id);
    }
    return changed;
  }

  setRaised(conversationId: string, sessionId: string, raised: boolean): boolean {
    const queue = this.queues.get(conversationId);
    const member = this.members.get(conversationId)?.find(person => person.sessionId === sessionId);
    if (!queue || !member) return false;
    const existing = queue.entries.find(entry => entry.sessionId === sessionId);
    if (Boolean(existing) === raised) return false;
    if (raised) {
      if (queue.entries.length >= CONVERSATION_MEMBERS_MAX_COUNT || queue.nextSequence >= Number.MAX_SAFE_INTEGER) return false;
      queue.entries.push({ memberId: member.id, sessionId, orderSequence: ++queue.nextSequence });
    } else {
      queue.entries = queue.entries.filter(entry => entry.sessionId !== sessionId);
    }
    queue.revision = ++this.revision;
    return true;
  }

  snapshot(conversationId: string): { revision: number; entries: MeetingHandEntry[] } | undefined {
    const queue = this.queues.get(conversationId);
    return queue ? { revision: queue.revision, entries: queue.entries.map(entry => ({ ...entry })) } : undefined;
  }
}
