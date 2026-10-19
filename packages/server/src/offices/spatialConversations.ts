import { randomUUID } from "node:crypto";
import type { Conversation, ConversationKind, ConversationMember, ConversationSnapshot, ConversationMediaTarget } from "@gammyverse/shared";
export type SpatialConversationMember = ConversationMember & { kind: ConversationKind; targetId: string; mediaTarget?: ConversationMediaTarget; admissionLeaseId?: string };
type Candidate = { kind: ConversationKind; targetId: string; mediaTarget?: ConversationMediaTarget; members: ConversationMember[] };
function candidates(members: SpatialConversationMember[]): Candidate[] {
  const groups = new Map<string, Candidate>();
  for (const { kind, targetId, mediaTarget, admissionLeaseId: _leaseId, ...person } of members) {
    const key = JSON.stringify([kind, targetId]);
    const group = groups.get(key) ?? { kind, targetId, mediaTarget, members: [] };
    group.members.push(person);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ ...group, members: group.members.sort((a, b) => a.id.localeCompare(b.id)) })).sort((a, b) => a.targetId.localeCompare(b.targetId));
}
function overlap(candidate: Candidate, previous: Conversation): number {
  return candidate.members.filter(member => previous.members.some(old => old.id === member.id)).length;
}
function assignContinuity(groups: Candidate[], previous: Conversation[]): Map<Candidate, Conversation> {
  const matches = groups.flatMap(group => previous.filter(old => old.kind === "proximity" && group.kind === "proximity").map(old => ({ group, old, count: overlap(group, old) })))
    .filter(match => match.count > 0).sort((a, b) => b.count - a.count || a.old.id.localeCompare(b.old.id) || a.group.targetId.localeCompare(b.group.targetId));
  const result = new Map<Candidate, Conversation>();
  const used = new Set<string>();
  for (const match of matches) {
    if (result.has(match.group) || used.has(match.old.id)) continue;
    result.set(match.group, match.old);
    used.add(match.old.id);
  }
  return result;
}
/** Projection only: the coordinator supplies the same membership maps used for grants. */
export class SpatialConversations {
  readonly roomIncarnationId = randomUUID();
  private revision = 0;
  private conversations: Conversation[] = [];
  private signature = "";
  private readonly leases = new Map<string,string>();
  constructor(readonly officeId: string) {}
  reconcile(members: SpatialConversationMember[]): boolean {
    this.leases.clear();
    for(const member of members)if(member.admissionLeaseId)this.leases.set(member.sessionId,member.admissionLeaseId);
    const groups = candidates(members);
    const continuity = assignContinuity(groups, this.conversations);
    const next = groups.map(group => this.project(group, continuity.get(group)));
    const signature = JSON.stringify([next,[...this.leases].sort()]);
    if (signature === this.signature) return false;
    this.signature = signature;
    this.conversations = next;
    this.revision += 1;
    return true;
  }
  private project(group: Candidate, retained?: Conversation): Conversation {
    const id = group.kind === "proximity" ? retained?.id ?? randomUUID() : `${this.roomIncarnationId}:${group.kind}:${group.targetId}`;
    const previous = retained ?? this.conversations.find(conversation => conversation.id === id);
    const generation = previous ? previous.mediaTarget.generation + Number(previous.mediaTarget.id !== group.targetId) : 0;
    return { id, kind: group.kind, mediaTarget: group.mediaTarget ?? { id: group.targetId, generation }, members: group.members };
  }
  all(): Conversation[] { return structuredClone(this.conversations); }
  snapshot(sessionId: string): ConversationSnapshot {
    const conversation = this.conversations.find(group => group.members.some(member => member.sessionId === sessionId));
    return { officeId: this.officeId, roomIncarnationId: this.roomIncarnationId, revision: this.revision, ...(conversation && this.leases.has(sessionId) ? {admissionLeaseId:this.leases.get(sessionId)} : {}), conversation: conversation ? structuredClone(conversation) : null };
  }
}
