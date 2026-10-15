import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { isValidUserStatusCommand, type CustomStatus, type UserStatus, type UserStatusCommand } from "@gammyverse/shared";
import { matchesAvailabilityAcknowledgement, matchesAvailabilityResponseRequestId, type AvailabilityAcknowledgement } from "./AvailabilitySave";

const SAVE_TIMEOUT_MS = 15_000;
const DISCONNECTED_LABEL = "Reconnect before changing your status.";
const SAVE_TIMEOUT_LABEL = "Status confirmation did not arrive. Check your connection and try again.";
const INVALID_STATUS_LABEL = "Check your status text, emoji and expiry.";
const SAVE_FAILED_LABEL = "Could not save your status. Please try again.";
type AvailabilitySaveState = { pending: boolean; error: string | null; savedSequence: number };
type PendingSave = { command: UserStatusCommand; resolve(saved: boolean): void };
const INITIAL_STATE: AvailabilitySaveState = { pending: false, error: null, savedSequence: 0 };

export function useAvailabilityStatus(room: Room | null) {
  const [state, setState] = useState<AvailabilitySaveState>(INITIAL_STATE);
  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPending = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    return pending;
  }, []);
  const finish = useCallback((saved: boolean, error: string | null) => {
    const pending = cancelPending();
    if (!pending) return;
    setState((previous) => ({ pending: false, error, savedSequence: previous.savedSequence + Number(saved) }));
    pending.resolve(saved);
  }, [cancelPending]);
  useEffect(() => {
    setState(INITIAL_STATE);
    if (!room) return;
    const disposeAck = room.onMessage("user-status", (message: AvailabilityAcknowledgement) => {
      const pending = pendingRef.current;
      if (pending && matchesAvailabilityAcknowledgement(pending.command, message, room.sessionId)) finish(true, null);
    });
    const disposeError = room.onMessage("user-status-error", (message: { error?: string; requestId?: string }) => {
      const pending = pendingRef.current;
      if (pending && matchesAvailabilityResponseRequestId(pending.command, message)) finish(false, message.error || SAVE_FAILED_LABEL);
    });
    return () => { cancelPending()?.resolve(false); disposeAck(); disposeError(); };
  }, [room, cancelPending, finish]);
  const save = useCallback((status: UserStatus, customStatus?: CustomStatus | null): Promise<boolean> => {
    if (pendingRef.current) return Promise.resolve(false);
    const requestId = crypto.randomUUID();
    const command = customStatus === undefined ? { status, requestId } : { status, customStatus, requestId };
    const error = !room ? DISCONNECTED_LABEL : !isValidUserStatusCommand(command) ? INVALID_STATUS_LABEL : null;
    if (error || !room) { setState((previous) => ({ ...previous, pending: false, error })); return Promise.resolve(false); }
    return new Promise<boolean>((resolve) => {
      pendingRef.current = { command, resolve };
      setState((previous) => ({ ...previous, pending: true, error: null }));
      timerRef.current = setTimeout(() => finish(false, SAVE_TIMEOUT_LABEL), SAVE_TIMEOUT_MS);
      try { room.send("user-status", command); } catch (cause) {
        finish(false, SAVE_FAILED_LABEL);
        if (!(cause instanceof Error)) throw cause;
      }
    });
  }, [room, finish]);
  return { ...state, save };
}
