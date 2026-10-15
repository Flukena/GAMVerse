import { PRIVATE_ZONE_ACCESS_EVENT, PRIVATE_ZONE_RESULT_EVENT, isValidPrivateZoneAccessSnapshot, isValidPrivateZoneResult, type PrivateCapabilities, type PrivateZoneAccessSnapshot, type PrivateZoneCommand, type PrivateZoneResult, type RoomLayout } from "@gammyverse/shared";
import type { ConversationTransport } from "../media/conversationState";

export type ConversationAccessZone = { id: string; name: string };
export function conversationAccessZones(layout: RoomLayout | null): ConversationAccessZone[] {
  return layout?.zones.filter(zone => zone.kind === "meeting" || zone.kind === "private").map(zone => ({ id: zone.id, name: zone.name })) ?? [];
}
type WithoutCommandContext<T> = T extends unknown ? Omit<T, "requestId" | "zoneId" | "expectedRevision"> : never;
export type PrivateZoneAction = WithoutCommandContext<PrivateZoneCommand>;
const ACTION_CAPABILITIES: Record<PrivateZoneCommand["action"], keyof PrivateCapabilities> = {
  lock: "lock", unlock: "unlock", knock: "knock", "cancel-knock": "cancelKnock", "retry-media": "retryMedia",
  admit: "admit", decline: "admit", revoke: "revoke",
};
export class ConversationAccessState {
  snapshot: PrivateZoneAccessSnapshot | null = null;
  constructor(readonly officeId: string, readonly zoneId: string, readonly sessionId: string, readonly roomIncarnationId?: string) {}
  receive(payload: unknown): boolean {
    if (!isValidPrivateZoneAccessSnapshot(payload) || payload.officeId !== this.officeId || payload.zoneId !== this.zoneId) return false;
    const incarnation = this.roomIncarnationId ?? this.snapshot?.roomIncarnationId;
    if (incarnation && payload.roomIncarnationId !== incarnation) return false;
    if (this.snapshot && payload.revision <= this.snapshot.revision) return false;
    if (payload.ownKnock && payload.ownKnock.sessionId !== this.sessionId) return false;
    if (!payload.capabilities.admit && payload.pendingKnocks.length > 0) return false;
    if (!payload.capabilities.revoke && payload.revocableGuests.length > 0) return false;
    this.snapshot = payload;
    return true;
  }
}
export function privateActionEnabled(snapshot: PrivateZoneAccessSnapshot | null, action: PrivateZoneAction, pending: boolean, nowMs: number): boolean {
  if (!snapshot || pending || !snapshot.capabilities[ACTION_CAPABILITIES[action.action]]) return false;
  if (action.action === "admit" || action.action === "decline") return snapshot.pendingKnocks.some(knock => knock.id === action.knockId && knock.state === "pending" && knock.expiresAtMs > nowMs);
  if (action.action === "cancel-knock") return snapshot.ownKnock?.state === "pending" && snapshot.ownKnock.expiresAtMs > nowMs;
  if (action.action === "revoke") return snapshot.revocableGuests.some(guest => guest.sessionId === action.targetSessionId && guest.expiresAtMs > nowMs);
  return true;
}
export interface ConversationAccessListener {
  snapshotChanged(snapshot: PrivateZoneAccessSnapshot): void;
  resultReceived(result: PrivateZoneResult): void;
}
export function observeConversationAccess(state: ConversationAccessState, room: ConversationTransport, listener: ConversationAccessListener): () => void {
  let active = true;
  const disposeSnapshot = room.onMessage(PRIVATE_ZONE_ACCESS_EVENT, payload => {
    if (active && state.receive(payload) && state.snapshot) listener.snapshotChanged(state.snapshot);
  });
  const disposeResult = room.onMessage(PRIVATE_ZONE_RESULT_EVENT, payload => { if (active && isValidPrivateZoneResult(payload)) listener.resultReceived(payload); });
  return () => { active = false; disposeSnapshot(); disposeResult(); };
}
