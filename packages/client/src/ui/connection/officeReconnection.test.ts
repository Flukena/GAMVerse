import assert from "node:assert/strict";
import test from "node:test";
import { ABNORMAL_CLOSE_CODE, CONSENTED_CLOSE_CODE, REMOVED_CLOSE_CODE, REPLACED_CLOSE_CODE, WITH_ERROR_CLOSE_CODE, installOfficeReconnection, reconnectCloseCode, shouldFreshJoin, type ReconnectableOfficeRoom } from "./officeReconnection.ts";

// Independent expectations from the supplied SDK Room.ts close-code contract.
const SDK_WITH_ERROR_CLOSE_CODE = 4002;
const SDK_RETRY_CLOSE_CODE = 1006;
const SDK_NATIVE_RETRY_CLOSE_CODES = [1001, 1005, 1006, 4010];
const SDK_FAILED_TO_RECONNECT_CLOSE_CODE = 4003;

const RESERVED_WINDOW_MS = 20_000;
const SDK_RETRY_BACKOFF_MULTIPLIER = 2;
const FIRST_RETRY_COUNT = 1;
const INITIAL_CALL_COUNT = 0;
const TEST_ROOM_ID = "test-office-room";
const TEST_SESSION_ID = "test-session";
const TEST_RECONNECTION_TOKEN = "test-token";
const TEST_CLOSE_REASON = "transport closed";

function createTransportHarness() {
  const closedCodes: number[] = [];
  const reconnectTokens: string[] = [];
  const room: ReconnectableOfficeRoom = {
    roomId: TEST_ROOM_ID,
    sessionId: TEST_SESSION_ID,
    connection: {
      events: { onclose: (event) => { closedCodes.push(event.code); } },
      reconnect: (options) => { reconnectTokens.push(options.reconnectionToken); },
    },
    reconnection: { enabled: false, maxRetries: INITIAL_CALL_COUNT, delay: INITIAL_CALL_COUNT,
      minDelay: INITIAL_CALL_COUNT, maxDelay: INITIAL_CALL_COUNT, minUptime: INITIAL_CALL_COUNT },
  };
  return { room, closedCodes, reconnectTokens };
}

test("routes WITH_ERROR through SDK retries while a server seat is reserved", () => {
  assert.equal(WITH_ERROR_CLOSE_CODE, SDK_WITH_ERROR_CLOSE_CODE);
  assert.equal(reconnectCloseCode(SDK_WITH_ERROR_CLOSE_CODE), SDK_RETRY_CLOSE_CODE);
  assert.equal(ABNORMAL_CLOSE_CODE, SDK_RETRY_CLOSE_CODE);
});

test("preserves native retry codes and intentional or server-directed leave codes", () => {
  for (const code of [...SDK_NATIVE_RETRY_CLOSE_CODES, CONSENTED_CLOSE_CODE, REPLACED_CLOSE_CODE, REMOVED_CLOSE_CODE]) {
    assert.equal(reconnectCloseCode(code), code);
  }
});

test("falls back to fresh join only after a reconnect terminates", () => {
  assert.equal(shouldFreshJoin(SDK_FAILED_TO_RECONNECT_CLOSE_CODE, true), true);
  assert.equal(shouldFreshJoin(SDK_FAILED_TO_RECONNECT_CLOSE_CODE, false), false);
});

test("does not rejoin on consent, replacement or removal even during a reconnect", () => {
  for (const code of [CONSENTED_CLOSE_CODE, REPLACED_CLOSE_CODE, REMOVED_CLOSE_CODE]) {
    assert.equal(shouldFreshJoin(code, true), false);
  }
});

test("adapts the public transport before SDK leave and covers the reserved window", () => {
  const { room, closedCodes } = createTransportHarness();
  const dispose = installOfficeReconnection(room);
  room.connection.events.onclose?.({ code: SDK_WITH_ERROR_CLOSE_CODE, reason: TEST_CLOSE_REASON });
  assert.deepEqual(closedCodes, [SDK_RETRY_CLOSE_CODE]);
  assert.equal(room.reconnection.enabled, true);
  const settings = room.reconnection;
  let elapsedMs = INITIAL_CALL_COUNT;
  for (let attempt = FIRST_RETRY_COUNT; attempt <= settings.maxRetries; attempt += FIRST_RETRY_COUNT) {
    elapsedMs += Math.min(settings.maxDelay, Math.max(settings.minDelay, SDK_RETRY_BACKOFF_MULTIPLIER ** attempt * settings.delay));
  }
  assert.ok(elapsedMs >= RESERVED_WINDOW_MS);
  dispose();
});

test("office exit stops queued retries while retaining transport close cleanup", () => {
  const { room, closedCodes, reconnectTokens } = createTransportHarness();
  const dispose = installOfficeReconnection(room);
  room.connection.reconnect({ reconnectionToken: TEST_RECONNECTION_TOKEN });
  assert.deepEqual(reconnectTokens, [TEST_RECONNECTION_TOKEN]);
  dispose();
  room.connection.reconnect({ reconnectionToken: TEST_RECONNECTION_TOKEN });
  assert.equal(reconnectTokens.length, FIRST_RETRY_COUNT);
  room.connection.events.onclose?.({ code: SDK_WITH_ERROR_CLOSE_CODE });
  assert.deepEqual(closedCodes, [CONSENTED_CLOSE_CODE]);
  assert.equal(room.reconnection.enabled, false);
});
