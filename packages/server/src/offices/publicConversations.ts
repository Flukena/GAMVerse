import { PUBLIC_CONVERSATION_NAMES_MAX_COUNT, PUBLIC_CONVERSATIONS_MAX_COUNT, type Conversation, type PublicConversationSummary, type PublicConversationsSnapshot } from "@gammyverse/shared";
type Position = {x: number; z: number};
type PublicZone = {id: string; name: string; x: number; z: number};
export function publicConversationSummaries(conversations: Conversation[], positions: ReadonlyMap<string, Position>, zones: ReadonlyMap<string, PublicZone>, lockedZoneIds: ReadonlySet<string>): PublicConversationSummary[] {
  const summaries: PublicConversationSummary[] = [];
  for (const conversation of conversations) {
    if (conversation.kind === "private" || lockedZoneIds.has(conversation.mediaTarget.id)) continue;
    const members = conversation.members.filter(person => positions.has(person.sessionId));
    if (!members.length) continue;
    const zone = zones.get(conversation.mediaTarget.id);
    const position = zone ?? positions.get(members[0]?.sessionId ?? "");
    if (!position) continue;
    summaries.push({id: conversation.id, kind: conversation.kind, name: zone?.name || "Nearby conversation",
      participantNames: members.slice(0, PUBLIC_CONVERSATION_NAMES_MAX_COUNT).map(person => person.displayName),
      participantCount: members.length, location: {x: position.x, z: position.z}});
  }
  return summaries.slice(0, PUBLIC_CONVERSATIONS_MAX_COUNT);
}
export class PublicConversations {
  private revision = 0;
  private signature = "";
  private conversations: PublicConversationSummary[] = [];
  constructor(private readonly officeId: string, private readonly roomIncarnationId: string) {}
  reconcile(conversations: PublicConversationSummary[]): boolean {
    const signature = JSON.stringify(conversations);
    if (signature === this.signature) return false;
    this.signature = signature;
    this.conversations = structuredClone(conversations);
    this.revision += 1;
    return true;
  }
  snapshot(): PublicConversationsSnapshot { return {officeId: this.officeId, roomIncarnationId: this.roomIncarnationId, revision: this.revision, conversations: structuredClone(this.conversations)}; }
  find(id: string): PublicConversationSummary | undefined { return this.snapshot().conversations.find(conversation => conversation.id === id); }
}
