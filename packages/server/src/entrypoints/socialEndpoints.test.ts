import assert from "node:assert/strict";
import test from "node:test";
import {
  chatHistoryFailureStatus,
  validChatHistoryQuery,
} from "./chatHistoryEndpoint.js";
import {
  chatHistory,
  ChatHistoryAuthorizationError,
} from "../offices/chatRepository.js";
import { spotlightFailureStatus } from "./spotlightEndpoint.js";
import { SpotlightAuthorizationError } from "../media/spotlightGrant.js";

test("spotlight authorization failure is terminal forbidden, service failure remains retryable", () => {
  assert.equal(
    spotlightFailureStatus(new SpotlightAuthorizationError("changed")),
    403,
  );
  assert.equal(spotlightFailureStatus(new Error("service failed")), 503);
});
test("malformed history queries denied before storage, normalized DM accepted", () => {
  assert.equal(
    validChatHistoryQuery({ scope: "office", before: ["1", "2"] }),
    false,
  );
  assert.equal(validChatHistoryQuery({ scope: "nearby" }), false);
  assert.equal(
    validChatHistoryQuery({ scope: "dm", with: "Bob", before: "bad" }),
    false,
  );
  assert.equal(validChatHistoryQuery({ scope: "dm", with: "Bob" }), true);
});

test("out-of-range SQL bigint cursors are malformed history queries", () => {
  assert.equal(
    validChatHistoryQuery({
      scope: "office",
      before: "999999999999999999999999",
    }),
    false,
  );
  assert.equal(validChatHistoryQuery({ scope: "office", before: "0" }), false);
  assert.equal(
    validChatHistoryQuery({ scope: "office", before: "9223372036854775807" }),
    true,
  );
});

test("chat history: authorization errors are 403, storage failures are 503", async () => {
  assert.equal(
    chatHistoryFailureStatus(new ChatHistoryAuthorizationError("denied")),
    403,
  );
  assert.equal(chatHistoryFailureStatus(new Error("connection refused")), 503);
  await assert.rejects(
    chatHistory("alice", "office", "office", undefined, undefined, null),
    (error) => chatHistoryFailureStatus(error) === 503,
  );
  await assert.rejects(
    chatHistory(
      "alice",
      "office",
      "office",
      undefined,
      undefined,
      { query: async () => ({ rows: [] }) } as never,
      async () => null,
    ),
    (error) => chatHistoryFailureStatus(error) === 403,
  );
});
