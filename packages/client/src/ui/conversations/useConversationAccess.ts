import { useCallback, useEffect, useMemo, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { PRIVATE_ZONE_ACCESS_REQUEST_EVENT, PRIVATE_ZONE_COMMAND_EVENT, type PrivateZoneAccessSnapshot } from "@gammyverse/shared";
import type { ConversationTransport } from "../media/conversationState";
import { ConversationAccessState, observeConversationAccess, privateActionEnabled, type ConversationAccessZone, type PrivateZoneAction } from "./conversationAccessState";
import { useConversationRequest } from "./useConversationRequest";

const ACCESS_CLOCK_INTERVAL_MS = 1_000;
const REQUEST_FAILED_LABEL = "Room access could not be changed. Please refresh and try again.";
export interface ConversationAccessProps {
  room: Room | null;
  officeId: string | null;
  sessionKey: string | null;
  zoneId: string | null;
  zones: readonly ConversationAccessZone[];
  roomIncarnationId?: string;
}
export function useConversationAccess(props: ConversationAccessProps) {
  const { room, officeId, sessionKey, roomIncarnationId } = props;
  const [selection, setSelection] = useState<{ officeId: string | null; baseZoneId: string | null; zoneId: string } | null>(null);
  const selectedZoneId = selection?.officeId === officeId && selection.baseZoneId === props.zoneId ? selection.zoneId : props.zoneId;
  const owner = useMemo(() => room && officeId && sessionKey && selectedZoneId
    ? new ConversationAccessState(officeId, selectedZoneId, room.sessionId, roomIncarnationId) : null, [room, officeId, sessionKey, selectedZoneId, roomIncarnationId]);
  const scopeRoom = useMemo<ConversationTransport | null>(() => room && owner ? {
    onMessage: (event, callback) => room.onMessage(event, callback), send: (event, payload) => room.send(event, payload),
  } : null, [room, owner]);
  const request = useConversationRequest(scopeRoom);
  const [accepted, setAccepted] = useState<{ owner: ConversationAccessState; snapshot: PrivateZoneAccessSnapshot } | null>(null);
  const [nowMs, setNowMs] = useState(Date.now);
  const sync = useCallback(() => owner ? request.send(PRIVATE_ZONE_ACCESS_REQUEST_EVENT, { zoneId: owner.zoneId }) : false, [owner, request.send]);
  useEffect(() => {
    if (!owner || !scopeRoom) return;
    const dispose = observeConversationAccess(owner, scopeRoom, {
      snapshotChanged: snapshot => setAccepted({ owner, snapshot }),
      resultReceived: result => request.acknowledge(result.requestId, result.ok ? null : result.error || REQUEST_FAILED_LABEL),
    });
    sync();
    return dispose;
  }, [owner, scopeRoom, sync, request.acknowledge]);
  const snapshot = accepted?.owner === owner ? accepted.snapshot : null;
  const hasDeadline = Boolean((snapshot?.ownKnock?.state === "pending" && snapshot.ownKnock.expiresAtMs > nowMs)
    || (snapshot?.leaseExpiresAtMs && snapshot.leaseExpiresAtMs > nowMs)
    || snapshot?.pendingKnocks.some(knock => knock.expiresAtMs > nowMs) || snapshot?.revocableGuests.some(guest => guest.expiresAtMs > nowMs));
  useEffect(() => {
    if (!hasDeadline) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), ACCESS_CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasDeadline]);
  const command = (action: PrivateZoneAction): boolean => {
    if (!privateActionEnabled(snapshot, action, request.pending, Date.now()) || !snapshot) return false;
    return request.send(PRIVATE_ZONE_COMMAND_EVENT, { ...action, zoneId: snapshot.zoneId, expectedRevision: snapshot.revision });
  };
  const selectZone = (zoneId: string) => {
    if (!props.zones.some(zone => zone.id === zoneId)) return;
    setSelection({ officeId, baseZoneId: props.zoneId, zoneId });
  };
  const resetSelection = () => setSelection(null);
  return { snapshot, automaticZoneId: props.zoneId, resetSelection, zoneId: selectedZoneId, zones: props.zones, selectZone, pending: request.pending, error: request.error, nowMs, command, sync };
}
export type ConversationAccessModel = ReturnType<typeof useConversationAccess>;
