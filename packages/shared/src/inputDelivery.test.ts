import assert from "node:assert/strict";
import test from "node:test";
import { INPUT_HEARTBEAT_INTERVAL_MS, INPUT_MIN_INTERVAL_MS, InputSendGate } from "./inputDelivery.ts";

const INITIAL_TIME_MS = 0;
const BEFORE_MIN_INTERVAL_MS = 29;
const MIN_INTERVAL_MS = 30;
const BEFORE_HEARTBEAT_MS = 49;
const HEARTBEAT_MS = 50;
const ONE_SECOND_MS = 1_000;
const ONE_MS = 1;
const MAX_INPUT_MESSAGES_PER_SECOND_COUNT = 34;
const RETRY_INPUT_PERIOD_MS = MIN_INTERVAL_MS + ONE_MS;
const IDLE_INPUT = { x: 0, z: 0, sprint: false };
const FORWARD_INPUT = { x: 0, z: -1, sprint: false };
const SPRINT_INPUT = { ...FORWARD_INPUT, sprint: true };
const INITIAL_AIM_RAD = 0;
const LATEST_AIM_RAD = Math.PI / 2;

test("uses the server's 30 ms minimum and the existing 50 ms heartbeat", () => {
  assert.equal(INPUT_MIN_INTERVAL_MS, MIN_INTERVAL_MS);
  assert.equal(INPUT_HEARTBEAT_INTERVAL_MS, HEARTBEAT_MS);
});

test("coalesces key changes and stop input until the server can accept them", () => {
  const gate = new InputSendGate();
  assert.deepEqual(gate.take(IDLE_INPUT, INITIAL_TIME_MS), IDLE_INPUT);
  assert.equal(gate.take(FORWARD_INPUT, BEFORE_MIN_INTERVAL_MS), null);
  assert.deepEqual(gate.take(SPRINT_INPUT, MIN_INTERVAL_MS), SPRINT_INPUT);
  assert.equal(gate.take(IDLE_INPUT, BEFORE_HEARTBEAT_MS), null);
  assert.deepEqual(gate.take(IDLE_INPUT, MIN_INTERVAL_MS + MIN_INTERVAL_MS), IDLE_INPUT);
});

test("sends unchanged intent only as a heartbeat, including idle intent", () => {
  for (const input of [IDLE_INPUT, FORWARD_INPUT]) {
    const gate = new InputSendGate();
    assert.deepEqual(gate.take(input, INITIAL_TIME_MS), input);
    assert.equal(gate.take({ ...input }, BEFORE_HEARTBEAT_MS), null);
    assert.deepEqual(gate.take({ ...input }, HEARTBEAT_MS), input);
  }
});

test("recognizes sprint changes and snapshots mutable caller input", () => {
  const gate = new InputSendGate();
  const input = { ...FORWARD_INPUT };
  gate.take(input, INITIAL_TIME_MS);
  input.sprint = true;
  assert.deepEqual(gate.take(input, MIN_INTERVAL_MS), SPRINT_INPUT);
});

test("caps rapid input changes at 34 sends in a one-second window", () => {
  const gate = new InputSendGate();
  const sentAtMs: number[] = [];
  for (let timeMs = INITIAL_TIME_MS; timeMs < ONE_SECOND_MS; timeMs += ONE_MS) {
    const input = timeMs % RETRY_INPUT_PERIOD_MS === INITIAL_TIME_MS ? FORWARD_INPUT : IDLE_INPUT;
    if (gate.take(input, timeMs)) sentAtMs.push(timeMs);
  }
  assert.ok(sentAtMs.length <= MAX_INPUT_MESSAGES_PER_SECOND_COUNT);
  for (let index = ONE_MS; index < sentAtMs.length; index += ONE_MS) {
    assert.ok(sentAtMs[index] - sentAtMs[index - ONE_MS] >= MIN_INTERVAL_MS);
  }
});

test("coalesces look-only changes and FPP exit through the minimum interval", () => {
  const gate = new InputSendGate();
  const initialLook = { ...IDLE_INPUT, facingYaw: INITIAL_AIM_RAD };
  const latestLook = { ...IDLE_INPUT, facingYaw: LATEST_AIM_RAD };
  assert.deepEqual(gate.take(initialLook, INITIAL_TIME_MS), initialLook);
  assert.equal(gate.take(latestLook, BEFORE_MIN_INTERVAL_MS), null);
  assert.deepEqual(gate.take(latestLook, MIN_INTERVAL_MS), latestLook);
  assert.equal(gate.take(IDLE_INPUT, BEFORE_HEARTBEAT_MS), null);
  assert.deepEqual(gate.take(IDLE_INPUT, MIN_INTERVAL_MS + MIN_INTERVAL_MS), IDLE_INPUT);
});
