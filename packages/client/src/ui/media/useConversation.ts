import { useEffect, useMemo, useState } from "react";
import type { Room } from "@colyseus/sdk";
import type { ConversationSnapshot } from "@gammyverse/shared";
import { ConversationState, observeConversationTransport } from "./conversationState";

export function useConversation(room: Room | null, officeId: string | null, transportKey: string | null): ConversationSnapshot | null {
  const state = useMemo(() => room && officeId && transportKey
    ? new ConversationState({ officeId, transportKey, sessionId: room.sessionId }) : null, [room, officeId, transportKey]);
  const [accepted, setAccepted] = useState<{ owner: ConversationState; snapshot: ConversationSnapshot } | null>(null);
  useEffect(() => {
    if (!room || !state) return;
    return observeConversationTransport(state, room, snapshot => setAccepted({ owner: state, snapshot }));
  }, [room, state]);
  return accepted?.owner === state ? accepted.snapshot : null;
}
