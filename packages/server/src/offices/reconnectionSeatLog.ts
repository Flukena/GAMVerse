import { logServerError, logServerEvent } from "../infra/logger.js";
import { ReconnectionSeatRejectedError } from "./sessionSecurity.js";

const RECONNECT_REJECTED_EVENT_LABEL = "office.client.reconnect.rejected";
const RECONNECT_FAILED_EVENT_LABEL = "office.client.reconnect.failed";

type ReconnectionLogContext = { roomId: string; officeId: string; sessionId: string };

export function logReconnectionSeatFailure(error: unknown, context: ReconnectionLogContext) {
  if (error instanceof ReconnectionSeatRejectedError) {
    logServerEvent("realtime", RECONNECT_REJECTED_EVENT_LABEL, { ...context, reason: error.message });
    return;
  }
  logServerError("realtime", RECONNECT_FAILED_EVENT_LABEL, error, context);
}
