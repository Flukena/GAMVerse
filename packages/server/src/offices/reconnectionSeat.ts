import type { Client, Deferred } from "@colyseus/core";
import { logReconnectionSeatFailure, type ReconnectionLogContext } from "./reconnectionSeatLog.js";
import type { SessionSecurity } from "./sessionSecurity.js";

type ReconnectionResult = Deferred<Client> | Promise<Client>;

/** Colyseus returns a plain rejected Promise when already disposing, rather than a cancellable Deferred. */
export function trackReconnectionSeat(reconnection: ReconnectionResult, security: SessionSecurity, username: string, context: ReconnectionLogContext) {
  const seat = "reject" in reconnection ? { reject: (error: Error) => reconnection.reject(error) } : undefined;
  if (seat) security.reserve(username, context.sessionId, seat);
  void reconnection.catch((error: unknown) => logReconnectionSeatFailure(error, context)).finally(() => {
    if (seat) security.releaseSeat(context.sessionId, seat);
  });
}
