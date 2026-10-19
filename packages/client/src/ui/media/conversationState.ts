import { CONVERSATION_SNAPSHOT_EVENT, CONVERSATION_SNAPSHOT_REQUEST_EVENT, isConversationSnapshot, type ConversationSnapshot, type ConversationListeningMode } from "@gammyverse/shared";
import { voiceTargetKey, type VoiceTarget } from "./voiceTarget";

export type ConversationContext = { officeId: string; transportKey: string; sessionId: string; roomIncarnationId?: string };
const INITIAL_REVISION = -1;

export class ConversationState {
  private current: ConversationSnapshot | null = null;
  constructor(readonly context: ConversationContext) {}
  get snapshot() { return this.current; }
  receive(payload: unknown, transportKey: string): boolean {
    if (transportKey !== this.context.transportKey || !isConversationSnapshot(payload)) return false;
    if (payload.officeId !== this.context.officeId) return false;
    const incarnation = this.context.roomIncarnationId ?? this.current?.roomIncarnationId;
    if (incarnation && incarnation !== payload.roomIncarnationId) return false;
    if (payload.revision <= (this.current?.revision ?? INITIAL_REVISION)) return false;
    if (payload.conversation && !payload.conversation.members.some(member => member.sessionId === this.context.sessionId)) return false;
    this.current = payload;
    return true;
  }
}

export interface ConversationTransport {
  onMessage(type: string, callback: (payload: unknown) => void): () => void;
  send(type: string, payload: object): void;
}

export function observeConversationTransport(state: ConversationState, room: ConversationTransport, changed: (snapshot: ConversationSnapshot) => void): () => void {
  let active = true;
  const dispose = room.onMessage(CONVERSATION_SNAPSHOT_EVENT, payload => {
    if (active && state.receive(payload, state.context.transportKey) && state.snapshot) changed(state.snapshot);
  });
  room.send(CONVERSATION_SNAPSHOT_REQUEST_EVENT, {});
  return () => { active = false; dispose(); };
}

export function conversationBindingKey(snapshot: ConversationSnapshot | null, transportKey: string, mode: ConversationListeningMode = "join"): string | null {
  const target = deriveConversationVoiceTarget(snapshot, transportKey, false, mode);
  return target ? voiceTargetKey(target) : null;
}

export function deriveConversationVoiceTarget(snapshot: ConversationSnapshot | null, sessionKey: string | null, paused: boolean, mode: ConversationListeningMode = "join"): VoiceTarget | null {
  const conversation = snapshot?.conversation;
  if (!conversation || !sessionKey || paused || mode === "off" || conversation.mediaTarget.available === false) return null;
  return { officeId: snapshot.officeId, sessionKey, kind: conversation.kind, id: conversation.mediaTarget.id, mode,
    conversationId: conversation.id, conversationGeneration: conversation.mediaTarget.generation,
    roomIncarnationId: snapshot.roomIncarnationId };
}
