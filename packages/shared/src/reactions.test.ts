import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidReaction,
  isValidHandRaise,
  shouldClearHandRaise,
} from "./reactions.js";
import { isValidSpotlightCommand } from "./spotlight.js";

test("reaction and hand raise validators reject unknown values", () => {
  assert.equal(isValidReaction({ emoji: "👍" }), true);
  assert.equal(isValidReaction({ emoji: "spam" }), false);
  assert.equal(isValidHandRaise({ raised: true }), true);
  assert.equal(isValidHandRaise({ raised: "true" }), false);
  assert.equal(
    isValidSpotlightCommand({ action: "request", targetUsername: "bob" }),
    true,
  );
  assert.equal(
    isValidSpotlightCommand({ action: "request", targetUsername: "" }),
    false,
  );
  assert.equal(
    isValidSpotlightCommand({ action: "respond", requestId: "request-123", accept: 1 }),
    false,
  );
});
test("own zone changes and offline clear a hand, group rotation and status-only changes do not", () => {
  assert.equal(shouldClearHandRaise("meeting-a", "meeting-b", true), true);
  assert.equal(shouldClearHandRaise("", "", false), true);
  assert.equal(shouldClearHandRaise("", "", true), false);
  assert.equal(shouldClearHandRaise("meeting-a", "meeting-a", true), false);
});
