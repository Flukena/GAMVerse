import assert from "node:assert/strict";
import test from "node:test";
import { TravelFeedbackTracker } from "./travelFeedbackTracker";

const FIRST_DESTINATION = { x: 8, z: 12 };
const SECOND_DESTINATION = { x: 16, z: 24 };

test("an overlapping request cannot overwrite the first pending destination", () => {
  const tracker = new TravelFeedbackTracker();
  assert.equal(tracker.expectDestination(FIRST_DESTINATION), true);
  assert.equal(tracker.expectDestination(SECOND_DESTINATION), false);
  assert.match(tracker.snapshot.requestNotice ?? "", /Waiting for route/);
  tracker.receiveStatus({ status: "unreachable" });
  assert.equal(tracker.snapshot.feedback?.destination, null);
  assert.equal(tracker.expectDestination(SECOND_DESTINATION), true);
  tracker.receiveStatus({ status: "started" });
  assert.deepEqual(tracker.snapshot.feedback?.destination, SECOND_DESTINATION);
});

test("person travel and route replacement clear the previous marker while requesting", () => {
  const tracker = new TravelFeedbackTracker();
  tracker.expectDestination(FIRST_DESTINATION);
  tracker.receiveStatus({ status: "started" });
  assert.equal(tracker.expectDestination(null), true);
  assert.deepEqual(tracker.snapshot.feedback, null);
  assert.equal(tracker.snapshot.requesting, true);
  assert.match(tracker.snapshot.requestNotice ?? "", /Updating route/);
  tracker.receiveStatus({ status: "started" });
  assert.deepEqual(tracker.snapshot.feedback, { status: "started", destination: null });
});

test("invalid statuses do not release the request lock", () => {
  const tracker = new TravelFeedbackTracker();
  tracker.expectDestination(FIRST_DESTINATION);
  assert.equal(tracker.receiveStatus({ status: "unknown" }), false);
  assert.equal(tracker.snapshot.requesting, true);
});

test("timeout releases the request without inventing a server status", () => {
  const tracker = new TravelFeedbackTracker();
  tracker.expectDestination(FIRST_DESTINATION);
  tracker.expire();
  assert.deepEqual(tracker.snapshot.feedback, null);
  assert.equal(tracker.snapshot.requesting, false);
  assert.match(tracker.snapshot.requestNotice ?? "", /timed out/);
  assert.equal(tracker.expectDestination(SECOND_DESTINATION), true);
});

test("reset releases the request and discards feedback across offices", () => {
  const tracker = new TravelFeedbackTracker();
  tracker.expectDestination(FIRST_DESTINATION);
  tracker.reset();
  assert.deepEqual(tracker.snapshot, { feedback: null, requestNotice: null, requesting: false });
  assert.equal(tracker.expectDestination(SECOND_DESTINATION), true);
});

test("replacing an active route never associates an uncorrelated status with the new point", () => {
  const tracker = new TravelFeedbackTracker();
  tracker.expectDestination(FIRST_DESTINATION);
  tracker.receiveStatus({ status: "started" });
  assert.equal(tracker.expectDestination(SECOND_DESTINATION), true);
  assert.match(tracker.snapshot.requestNotice ?? "", /destination marker unavailable/);
  tracker.receiveStatus({ status: "started" });
  assert.equal(tracker.snapshot.feedback?.destination, null);
  tracker.receiveStatus({ status: "arrived" });
  tracker.receiveStatus({ status: "started" });
  assert.equal(tracker.snapshot.feedback?.destination, null);
});

test("old arrival before replacement start cannot attach the replacement point", () => {
  const tracker = new TravelFeedbackTracker();
  tracker.expectDestination(FIRST_DESTINATION);
  tracker.receiveStatus({ status: "started" });
  tracker.expectDestination(SECOND_DESTINATION);
  tracker.receiveStatus({ status: "arrived" });
  tracker.receiveStatus({ status: "started" });
  assert.equal(tracker.snapshot.feedback?.destination, null);
});

test("timeout discards marker certainty for retries until an office reset", () => {
  const tracker = new TravelFeedbackTracker();
  tracker.expectDestination(FIRST_DESTINATION);
  tracker.expire();
  tracker.expectDestination(SECOND_DESTINATION);
  tracker.receiveStatus({ status: "started" });
  assert.equal(tracker.snapshot.feedback?.destination, null);
  tracker.receiveStatus({ status: "arrived" });
  tracker.expectDestination(SECOND_DESTINATION);
  tracker.receiveStatus({ status: "started" });
  assert.equal(tracker.snapshot.feedback?.destination, null);
  tracker.reset();
  tracker.expectDestination(SECOND_DESTINATION);
  tracker.receiveStatus({ status: "started" });
  assert.deepEqual(tracker.snapshot.feedback?.destination, SECOND_DESTINATION);
});


test("server-initiated meeting travel cannot reuse a previous local destination marker", () => {
  const tracker = new TravelFeedbackTracker();
  tracker.expectDestination({ x: 1, z: 2 });
  tracker.receiveStatus({ status: "started" });
  assert.deepEqual(tracker.snapshot.feedback?.destination, { x: 1, z: 2 });
  tracker.receiveStatus({ status: "started", destination: { x: 5, z: 6 } });
  assert.deepEqual(tracker.snapshot.feedback, { status: "started", destination: null });
});
