interface ConnectionClose {
  code: number;
  reason?: string;
}

/** The public SDK seam used here; transport ownership stays with Colyseus. */
export interface ReconnectableOfficeRoom {
  roomId: string;
  sessionId: string;
  connection: {
    events: { onclose?: ((event: ConnectionClose) => unknown) | null };
    reconnect: (options: { reconnectionToken: string; skipHandshake?: boolean }) => void;
  };
  reconnection: {
    enabled: boolean;
    maxRetries: number;
    delay: number;
    minDelay: number;
    maxDelay: number;
    minUptime: number;
  };
}

// Colyseus 0.18 close codes; 4002 reserves a server seat but bypasses SDK retries.
export const WITH_ERROR_CLOSE_CODE = 4002;
export const ABNORMAL_CLOSE_CODE = 1006;
export const CONSENTED_CLOSE_CODE = 4000;
export const REPLACED_CLOSE_CODE = 4001;
export const REMOVED_CLOSE_CODE = 4004;
// SDK backoff: 0.5 + 1 + 2 + 6 * 3 = 21.5 s, covering the 20 s seat window.
export const RECONNECT_MAX_RETRIES_COUNT = 9;
export const RECONNECT_INITIAL_DELAY_MS = 250;
export const RECONNECT_MAX_DELAY_MS = 3_000;
export const RECONNECT_MIN_UPTIME_MS = 0;
export const FRESH_JOIN_DELAY_MS = 1_000;
export const FRESH_JOIN_MAX_RETRIES_COUNT = 5;
export const FRESH_JOIN_MAX_DELAY_MS = 4_000;
export const RETRY_BACKOFF_MULTIPLIER = 2;
export const DROP_EVENT_LABEL = "office.connection.dropped";
export const LEAVE_EVENT_LABEL = "office.connection.left";
const CLOSE_EVENT_LABEL = "office.connection.closed";

export function reconnectCloseCode(code: number): number {
  return code === WITH_ERROR_CLOSE_CODE ? ABNORMAL_CLOSE_CODE : code;
}

export function shouldFreshJoin(code: number, wasReconnecting: boolean): boolean {
  return wasReconnecting && ![CONSENTED_CLOSE_CODE, REPLACED_CLOSE_CODE, REMOVED_CLOSE_CODE].includes(code);
}

/** Adapt the public transport event seam, before Room destroys itself on 4002. */
export function installOfficeReconnection(room: ReconnectableOfficeRoom): () => void {
  const connection = room.connection;
  const onClose = connection.events.onclose;
  const reconnect = connection.reconnect.bind(connection);
  let disposed = false;
  room.reconnection.enabled = true;
  room.reconnection.maxRetries = RECONNECT_MAX_RETRIES_COUNT;
  room.reconnection.delay = RECONNECT_INITIAL_DELAY_MS;
  room.reconnection.minDelay = RECONNECT_INITIAL_DELAY_MS;
  room.reconnection.maxDelay = RECONNECT_MAX_DELAY_MS;
  room.reconnection.minUptime = RECONNECT_MIN_UPTIME_MS;
  connection.events.onclose = (event: ConnectionClose) => {
    console.info(CLOSE_EVENT_LABEL, { roomId: room.roomId, sessionId: room.sessionId, code: event.code, reason: event.reason });
    // Preserve the actual close above. The SDK consumes only code and reason.
    onClose?.({ code: disposed ? CONSENTED_CLOSE_CODE : reconnectCloseCode(event.code), reason: event.reason });
  };
  // SDK retry timers are not cancellable in 0.18. Guard them on office exit.
  connection.reconnect = (options) => {
    if (!disposed) reconnect(options);
  };
  return () => {
    disposed = true;
    room.reconnection.enabled = false;
  };
}
