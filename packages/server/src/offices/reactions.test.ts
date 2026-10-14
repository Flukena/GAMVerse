import assert from "node:assert/strict";
import test from "node:test";
import { ReactionGate } from "./reactions.js";
test("reaction throttle allows first, denies repeat, expires", () => {
  const gate = new ReactionGate();
  assert.equal(gate.accept("a", 0), true);
  assert.equal(gate.accept("a", 1), false);
  assert.equal(gate.accept("a", 1000), true);
});

test("reaction throttle evicts stale entries only, leave cannot reset it", () => {
  const gate = new ReactionGate();
  assert.equal("forget" in gate, false);
  gate.accept("alice", 0);
  assert.equal(gate.accept("alice", 1), false);
  gate.accept("bob", 10000);
  assert.equal(gate.size, 1);
});
