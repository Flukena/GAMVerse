import assert from "node:assert/strict";
import test from "node:test";
import { matchesAvailabilityAcknowledgement, matchesAvailabilityResponseRequestId } from "./AvailabilitySave";

const CUSTOM_STATUS = { text: "Focusing", emoji: "🎯", expiresAtMs: null };
const ACK = { sessionId: "local", status: "away", customStatus: CUSTOM_STATUS } as const;
test("only an own-session acknowledgement matching the requested profile confirms persistence", () => {
  const command = { status: "away", customStatus: CUSTOM_STATUS } as const;
  assert.equal(matchesAvailabilityAcknowledgement(command, ACK, "local"), true);
  assert.equal(matchesAvailabilityAcknowledgement(command, { ...ACK, sessionId: "other" }, "local"), false);
  assert.equal(matchesAvailabilityAcknowledgement(command, { ...ACK, status: "available" }, "local"), false);
  assert.equal(matchesAvailabilityAcknowledgement(command, { ...ACK, customStatus: { ...CUSTOM_STATUS, text: "Old" } }, "local"), false);
  assert.equal(matchesAvailabilityAcknowledgement(command, { ...ACK, customStatus: null }, "local"), false);
});
test("quick availability preserves the server custom status; clear requires null confirmation", () => {
  assert.equal(matchesAvailabilityAcknowledgement({ status: "away" }, ACK, "local"), true);
  assert.equal(matchesAvailabilityAcknowledgement({ status: "away", customStatus: null }, ACK, "local"), false);
  assert.equal(matchesAvailabilityAcknowledgement({ status: "away", customStatus: null }, { ...ACK, customStatus: null }, "local"), true);
});

test("late acknowledgement for an earlier identical save cannot confirm a newer request", () => {
  const command = { status: "away", customStatus: CUSTOM_STATUS, requestId: "new-request" } as const;
  const previousAck = { ...ACK, requestId: "previous-request" };
  const currentAck = { ...ACK, requestId: "new-request" };
  assert.equal(matchesAvailabilityAcknowledgement(command, previousAck, "local"), false);
  assert.equal(matchesAvailabilityAcknowledgement(command, ACK, "local"), false);
  assert.equal(matchesAvailabilityAcknowledgement(command, currentAck, "local"), true);
});


test("late errors and uncorrelated responses cannot terminate a newer pending save", () => {
  const command = { status: "away", requestId: "new-request" } as const;
  assert.equal(matchesAvailabilityResponseRequestId(command, { requestId: "previous-request" }), false);
  assert.equal(matchesAvailabilityResponseRequestId(command, {}), false);
  assert.equal(matchesAvailabilityResponseRequestId(command, { requestId: "new-request" }), true);
});

test("matching save acknowledgement accepts a status that expired during persistence", () => {
  const requestedExpiryMs = 10_000;
  const command = { status: "away", customStatus: { ...CUSTOM_STATUS, expiresAtMs: requestedExpiryMs }, requestId: "slow-save" } as const;
  const acknowledged = { ...ACK, customStatus: null, requestId: "slow-save" };
  assert.equal(matchesAvailabilityAcknowledgement(command, acknowledged, "local", requestedExpiryMs), true);
  assert.equal(matchesAvailabilityAcknowledgement(command, acknowledged, "local", requestedExpiryMs - 1), false);
  assert.equal(matchesAvailabilityAcknowledgement(command, { ...acknowledged, requestId: "old-save" }, "local", requestedExpiryMs), false);
});
