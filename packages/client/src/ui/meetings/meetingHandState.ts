import { MEETING_HANDS_SNAPSHOT_EVENT, MEETING_HAND_RESULT_EVENT, isMeetingHandsSnapshot, isMeetingHandResult, type ConversationSnapshot, type MeetingHandContext, type MeetingHandResult, type MeetingHandsSnapshot } from "@gammyverse/shared";
import type { ConversationTransport } from "../media/conversationState";

export type MeetingHandClientContext = MeetingHandContext & { sessionId: string; transportKey: string };
export type MeetingHandEntry = { memberId: string; sessionId: string; displayName: string; position: number; isLocal: boolean };
export class MeetingHandState {
  snapshot: MeetingHandsSnapshot | null = null;
  constructor(readonly context: MeetingHandClientContext) {}
  private matches(payload: MeetingHandContext, transportKey: string): boolean {
    return transportKey === this.context.transportKey && payload.officeId === this.context.officeId
      && payload.roomIncarnationId === this.context.roomIncarnationId && payload.conversationId === this.context.conversationId;
  }
  receive(payload: unknown, transportKey: string): boolean {
    if (!isMeetingHandsSnapshot(payload) || !this.matches(payload, transportKey)) return false;
    if (this.snapshot && payload.revision <= this.snapshot.revision) return false;
    this.snapshot = payload;
    return true;
  }
  acceptsResult(payload: unknown, transportKey: string): payload is MeetingHandResult {
    return isMeetingHandResult(payload) && this.matches(payload, transportKey);
  }
}
export function selectMeetingHands(queue: MeetingHandsSnapshot | null, conversation: ConversationSnapshot | null, sessionId: string | null): MeetingHandEntry[] {
  const admitted = conversation?.conversation;
  if (!queue || !conversation || !admitted || !sessionId || !admitted.members.some(member => member.sessionId === sessionId)) return [];
  if (queue.officeId !== conversation.officeId || queue.roomIncarnationId !== conversation.roomIncarnationId || queue.conversationId !== admitted.id) return [];
  return queue.entries.flatMap((entry, index) => {
    const member = admitted.members.find(candidate => candidate.id === entry.memberId && candidate.sessionId === entry.sessionId);
    return member ? [{ memberId: entry.memberId, sessionId: entry.sessionId, displayName: member.displayName || member.username, position: index + 1, isLocal: member.sessionId === sessionId }] : [];
  });
}
export interface MeetingHandListener {
  snapshotChanged(snapshot: MeetingHandsSnapshot): void;
  resultReceived(result: MeetingHandResult): void;
}
export function observeMeetingHands(state: MeetingHandState, room: ConversationTransport, listener: MeetingHandListener): () => void {
  let active = true;
  const disposeSnapshot = room.onMessage(MEETING_HANDS_SNAPSHOT_EVENT, payload => {
    if (active && state.receive(payload, state.context.transportKey) && state.snapshot) listener.snapshotChanged(state.snapshot);
  });
  const disposeResult = room.onMessage(MEETING_HAND_RESULT_EVENT, payload => {
    if (active && state.acceptsResult(payload, state.context.transportKey)) listener.resultReceived(payload);
  });
  return () => { active = false; disposeSnapshot(); disposeResult(); };
}
