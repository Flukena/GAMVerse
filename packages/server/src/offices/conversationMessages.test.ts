import assert from "node:assert/strict";
import test from "node:test";
import { CONVERSATION_SNAPSHOT_EVENT, CONVERSATION_SNAPSHOT_REQUEST_EVENT } from "@gammyverse/shared";
import { SpatialConversations } from "./spatialConversations.js";
import { registerConversationMessages } from "./conversationMessages.js";
test("snapshot request validates empty payload and cannot select another session or members", () => {
  const state = new SpatialConversations("office");
  const handlers = new Map<string, (client: {sessionId: string; send(type: string, payload: unknown): void}, payload: unknown) => void>();
  registerConversationMessages({onMessage: (type, handler) => {handlers.set(type, handler);}}, state);
  const sent: unknown[] = [];
  const client = {sessionId: "own", send: (type: string, payload: unknown) => {assert.equal(type, CONVERSATION_SNAPSHOT_EVENT);sent.push(payload);}};
  const request = handlers.get(CONVERSATION_SNAPSHOT_REQUEST_EVENT)!;
  request(client, {sessionId: "someone-else"});
  assert.equal(sent.length, 0);
  request(client, {}); request(client, {});
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], sent[1]);
});
