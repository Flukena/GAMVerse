import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_MAX_TEXT_CHARS,
  isValidChatSend,
  normalizeChatText,
} from "./chat.js";

test("chat requires valid scope, bounded non-empty text and a DM target", () => {
  assert.equal(isValidChatSend({ scope: "office", text: "hello" }), true);
  assert.equal(
    isValidChatSend({ scope: "dm", text: "hello", targetUsername: "bob" }),
    true,
  );
  for (const payload of [
    { scope: "dm", text: "hello" },
    { scope: "other", text: "hello" },
    { scope: "office", text: "  " },
    { scope: "office", text: "x".repeat(CHAT_MAX_TEXT_CHARS + 1) },
    { scope: "dm", text: "hi", targetUsername: "  " },
  ])
    assert.equal(isValidChatSend(payload), false);
  assert.equal(normalizeChatText("  hello\r\nworld\u0000  "), "hello\nworld");
});
