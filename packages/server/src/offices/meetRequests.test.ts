import assert from "node:assert/strict";
import test from "node:test";
import { MeetRequests } from "./meetRequests.js";
const NOW_MS = 100_000;
const TO = { username: "bob", sessionId: "bob-session", displayName: "Bob" };
test("four incoming reservations bound work before asynchronous membership begins", () => {
  const requests = new MeetRequests("office", "room");
  for (let index = 0; index < 4; index += 1) requests.reserve(`from-${index}`, { requestId: `request-${index}`, kind: "meet", targetSessionId: TO.sessionId }, NOW_MS);
  assert.throws(() => requests.reserve("fifth", { requestId: "fifth", kind: "meet", targetSessionId: TO.sessionId }, NOW_MS), /too many/);
});
test("terminal replay is bounded and snapshots retain only participant-owned offers", () => {
  const requests = new MeetRequests("office", "room");
  for (let index = 0; index < 260; index += 1) {
    const from = { username: "alice", sessionId: "alice-session", displayName: "Alice" };
    const command = { requestId: `request-${index}`, kind: "meet" as const, targetSessionId: TO.sessionId };
    const reservation = requests.reserve(from.sessionId, command, NOW_MS + index * 1000);
    const offer = requests.create(reservation, command, from, TO, NOW_MS + index * 1000, `offer-${index}`);
    requests.finish(offer, "declined");
  }
  assert.equal(requests.visible(TO.sessionId).length, 256);
  assert.equal(requests.visible("eve-session").length, 0);
  assert.equal(requests.replay("alice-session", "request-0"), undefined);
  assert.equal(requests.replay("alice-session", "request-259")?.state, "declined");
});
