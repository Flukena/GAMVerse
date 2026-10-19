import { useEffect, useMemo, useState } from "react";
import { availabilityPolicy, isMeetOfferError, type MeetActionCommand, type MeetOfferKind, type MeetOfferSnapshot, type UserStatus } from "@gammyverse/shared";
import type { ConversationTransport } from "../media/conversationState";
import { MeetOfferState, meetOfferActions } from "./meetOfferState";
import { useConversationRequest } from "./useConversationRequest";

const MEET_OFFERS_EVENT = "meet-offers";
const MEET_ERROR_EVENT = "meet-error";
const MEET_SYNC_EVENT = "meet-sync";
const MEET_CREATE_EVENT = "meet-create";
const MEET_ACTION_EVENT = "meet-action";
const OFFER_CLOCK_INTERVAL_MS = 1_000;
export interface MeetTransport extends ConversationTransport { sessionId: string }
export function useMeetOffers(room: MeetTransport | null, officeId: string | null, transportKey: string | null, status: UserStatus, roomIncarnationId?: string) {
  const owner = useMemo(() => room && officeId && transportKey ? new MeetOfferState(officeId, room.sessionId, roomIncarnationId) : null, [room, officeId, transportKey, roomIncarnationId]);
  const [accepted, setAccepted] = useState<{ owner: MeetOfferState; snapshot: MeetOfferSnapshot } | null>(null);
  const [nowMs, setNowMs] = useState(Date.now);
  const request = useConversationRequest(room);
  useEffect(() => {
    if (!room || !owner) return;
    let active = true;
    const disposeSnapshot = room.onMessage(MEET_OFFERS_EVENT, payload => {
      if (!active || !owner.acceptsContext(payload)) return;
      if (payload.requestId) request.acknowledge(payload.requestId);
      if (owner.receive(payload) && owner.snapshot) setAccepted({ owner, snapshot: owner.snapshot });
    });
    const disposeError = room.onMessage(MEET_ERROR_EVENT, payload => { if (active && isMeetOfferError(payload)) request.acknowledge(payload.requestId, payload.error); });
    room.send(MEET_SYNC_EVENT, {});
    return () => { active = false; disposeSnapshot(); disposeError(); };
  }, [room, owner, request.acknowledge]);
  const offers = accepted?.owner === owner ? accepted.snapshot.offers : [];
  const hasPendingOffers = offers.some(offer => offer.state === "pending");
  useEffect(() => {
    if (!hasPendingOffers) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), OFFER_CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPendingOffers]);
  const create = (kind: MeetOfferKind, targetSessionId: string): boolean => {
    if (!room || room.sessionId === targetSessionId || availabilityPolicy(status).suppressInterruptions) return false;
    return request.send(MEET_CREATE_EVENT, { kind, targetSessionId });
  };
  const act = (offerId: string, action: MeetActionCommand["action"]): boolean => {
    const offer = offers.find(candidate => candidate.id === offerId);
    if (!room || !offer || !meetOfferActions(offer, room.sessionId, status, Date.now(), request.pending).some(candidate => candidate.action === action && !candidate.disabled)) return false;
    return request.send(MEET_ACTION_EVENT, { offerId, expectedRevision: offer.revision, action });
  };
  return { offers, pending: request.pending, error: request.error, create, act, nowMs };
}
