import assert from "node:assert/strict";
import test from "node:test";
import { map2dTravelMessage, parseMap2dTravelStatus, updateMap2dTravelFeedback } from "./map2dTravelFeedback";

const DESTINATION = { x: 8, z: 12 };

test("authoritative started and reroute statuses preserve a visible destination", () => {
  const started = updateMap2dTravelFeedback(null, "started", DESTINATION);
  assert.deepEqual(started.destination, DESTINATION);
  assert.deepEqual(updateMap2dTravelFeedback(started, "started").destination, DESTINATION);
});

const TERMINAL_FEEDBACK = [
  ["arrived", "Arrived"],
  ["cancelled", "Travel cancelled"],
  ["blocked", "Route blocked. Choose another destination."],
  ["unreachable", "Can't reach that spot. Choose another destination."],
] as const;

for (const [status, message] of TERMINAL_FEEDBACK) {
  test(`${status} clears destination and exposes feedback`, () => {
    const started = updateMap2dTravelFeedback(null, "started", DESTINATION);
    const feedback = updateMap2dTravelFeedback(started, status);
    assert.equal(feedback.destination, null);
    assert.equal(feedback.status, status);
    assert.equal(map2dTravelMessage(feedback), message);
  });
}

test("travel status parser ignores malformed and unknown events", () => {
  for (const invalid of [null, undefined, "started", {}, { status: 1 }, { status: "unknown" }]) {
    assert.equal(parseMap2dTravelStatus(invalid), null);
  }
  assert.equal(parseMap2dTravelStatus({ status: "started", fastWalkFallback: true }), "started");
});

test("a server route with no local destination never invents a marker", () => {
  assert.equal(updateMap2dTravelFeedback(null, "started").destination, null);
});


test("a new route without a known destination clears the previous route marker", () => {
  const started = updateMap2dTravelFeedback(null, "started", DESTINATION);
  assert.equal(updateMap2dTravelFeedback(started, "started", null).destination, null);
});
