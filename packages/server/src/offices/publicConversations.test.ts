import assert from "node:assert/strict";
import test from "node:test";
import type { Conversation } from "@gammyverse/shared";
import { PublicConversations, publicConversationSummaries } from "./publicConversations.js";
function conversation(kind: Conversation["kind"], id = kind): Conversation {
  return {id,kind,mediaTarget:{id,generation:0},members:[{id:"alice",username:"alice",sessionId:"session",mediaIdentity:"opaque-secret-identity",displayName:"Alice",characterId:"character"}]};
}
test("public discovery hides private and locked zones and never exposes media identity or binding", () => {
  const summaries = publicConversationSummaries([conversation("private"),conversation("meeting"),conversation("proximity")], new Map([["session",{x:1,z:2}]]),new Map(),new Set(["meeting"]));
  assert.equal(summaries.length,1);
  assert.equal(summaries[0]!.kind,"proximity");
  assert.deepEqual(Object.keys(summaries[0]!).sort(),["id","kind","location","name","participantCount","participantNames"].sort());
  assert.equal(JSON.stringify(summaries).includes("opaque-secret-identity"),false);
});
test("unchanged discovery is idempotent and returned snapshots cannot mutate server state", () => {
  const state = new PublicConversations("office","incarnation");
  const summaries = publicConversationSummaries([conversation("proximity")],new Map([["session",{x:1,z:2}]]),new Map(),new Set());
  assert.equal(state.reconcile(summaries),true);
  const revision = state.snapshot().revision;
  assert.equal(state.reconcile(summaries),false);
  assert.equal(state.snapshot().revision,revision);
  state.snapshot().conversations.length = 0;
  assert.equal(state.find("proximity")?.participantNames[0],"Alice");
});
