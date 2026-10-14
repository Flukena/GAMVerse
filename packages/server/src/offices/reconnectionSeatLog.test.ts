import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { CloseCode, ServerError } from "@colyseus/core";
import { getRecentServerErrorCount } from "../infra/logger.js";
import { logReconnectionSeatFailure } from "./reconnectionSeatLog.js";

const RECONNECT_REJECTED_EVENT_LABEL = "office.client.reconnect.rejected";
const RECONNECT_FAILED_EVENT_LABEL = "office.client.reconnect.failed";
const RECONNECT_TIMEOUT_REASON_LABEL = "timeout";
const RECONNECT_SHUTDOWN_REASON_LABEL = "shutdown";
const UNCODED_ERROR_LABEL = "uncoded";
const ROOM_SHUTDOWN_MESSAGE_LABEL = "disconnecting";
const UNEXPECTED_FAILURE_MESSAGE_LABEL = "transport failed";
const CONTEXT = { roomId: "room", officeId: "office", sessionId: "session" };

for (const [reason, rejection] of [
  [RECONNECT_TIMEOUT_REASON_LABEL, false],
  [RECONNECT_SHUTDOWN_REASON_LABEL, new ServerError(CloseCode.NORMAL_CLOSURE, ROOM_SHUTDOWN_MESSAGE_LABEL)],
] as const) {
  test(`reconnect ${reason} rejection logs info without incrementing error metric`, () => {
    const errors: string[] = [];
    const events: string[] = [];
    mock.method(console, "error", (message: string) => { errors.push(message); });
    mock.method(console, "info", (message: string) => { events.push(message); });
    try {
      const errorsBefore = getRecentServerErrorCount();
      logReconnectionSeatFailure(rejection, CONTEXT);
      assert.deepEqual(errors, []);
      assert.equal(getRecentServerErrorCount(), errorsBefore);
      assert.equal(events.length, 1);
      const event = JSON.parse(events[0]!);
      assert.equal(event.level, "info");
      assert.equal(event.event, RECONNECT_REJECTED_EVENT_LABEL);
      assert.equal(event.reason, reason);
      assert.equal(event.sessionId, CONTEXT.sessionId);
    } finally { mock.restoreAll(); }
  });
}

for (const rejection of [
  new Error(UNEXPECTED_FAILURE_MESSAGE_LABEL),
  new ServerError(CloseCode.NORMAL_CLOSURE, UNEXPECTED_FAILURE_MESSAGE_LABEL),
  new ServerError(CloseCode.WITH_ERROR, ROOM_SHUTDOWN_MESSAGE_LABEL),
]) {
  test(`unexpected reconnect error remains error: ${rejection.message} / ${"code" in rejection ? rejection.code : UNCODED_ERROR_LABEL}`, () => {
    const errors: string[] = [];
    const events: string[] = [];
    mock.method(console, "error", (message: string) => { errors.push(message); });
    mock.method(console, "info", (message: string) => { events.push(message); });
    try {
      logReconnectionSeatFailure(rejection, CONTEXT);
      assert.deepEqual(events, []);
      assert.equal(errors.length, 1);
      const event = JSON.parse(errors[0]!);
      assert.equal(event.level, "error");
      assert.equal(event.event, RECONNECT_FAILED_EVENT_LABEL);
    } finally { mock.restoreAll(); }
  });
}
