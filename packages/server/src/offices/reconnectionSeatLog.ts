import { CloseCode, ServerError } from "@colyseus/core";
import { logServerError, logServerEvent } from "../infra/logger.js";
import { ReconnectionSeatRejectedError } from "./sessionSecurity.js";

const RECONNECT_REJECTED_EVENT_LABEL = "office.client.reconnect.rejected";
const RECONNECT_FAILED_EVENT_LABEL = "office.client.reconnect.failed";

const RECONNECT_TIMEOUT_REASON_LABEL = "timeout";
const RECONNECT_SHUTDOWN_REASON_LABEL = "shutdown";
const ROOM_SHUTDOWN_MESSAGE_LABEL = "disconnecting";

type ReconnectionLogContext = { roomId: string; officeId: string; sessionId: string };

function expectedRejectionReason(error: unknown) {
  if (error instanceof ReconnectionSeatRejectedError) return error.message;
  if (error === false) return RECONNECT_TIMEOUT_REASON_LABEL;
  if (error instanceof ServerError && error.code === CloseCode.NORMAL_CLOSURE && error.message === ROOM_SHUTDOWN_MESSAGE_LABEL) {
    return RECONNECT_SHUTDOWN_REASON_LABEL;
  }
  return undefined;
}

export function logReconnectionSeatFailure(error: unknown, context: ReconnectionLogContext) {
  const reason = expectedRejectionReason(error);
  if (reason !== undefined) {
    logServerEvent("realtime", RECONNECT_REJECTED_EVENT_LABEL, { ...context, reason });
    return;
  }
  logServerError("realtime", RECONNECT_FAILED_EVENT_LABEL, error, context);
}
