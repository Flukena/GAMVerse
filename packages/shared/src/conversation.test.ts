import assert from "node:assert/strict";
import test from "node:test";
import { isConversationSnapshot, isConversationSnapshotRequest, isSpatialMediaTokenRequest } from "./conversation.js";
test("snapshot validates identity, safe counters and unique members", () => {
  const person = {id: "alice", username: "alice", sessionId: "session", displayName: "Alice", characterId: "character",mediaIdentity: "identity"};
  const conversation = {id: "conversation", kind: "meeting", mediaTarget: {id: "zone", generation: 0}, members: [person]};
  const snapshot = {officeId: "office",roomIncarnationId: "incarnation", revision: 1,conversation};
  assert.equal(isConversationSnapshot(snapshot),true);
  assert.equal(isConversationSnapshot({...snapshot,revision: Infinity}),false);
  assert.equal(isConversationSnapshot({...snapshot,conversation:{...conversation,members:[person,person]}}),false);
  assert.equal(isConversationSnapshot({...snapshot,conversation:{...conversation,members:[{...person,id:"bob"}]}}),false);
  assert.equal(isConversationSnapshot({...snapshot,conversation:null}),true);
  assert.equal(isConversationSnapshot({...snapshot,conversation:{...conversation,members:[person,{...person,id:"bob",username:"bob",sessionId:"other"}]}}),false);
});
test("request cannot inject members and token binding must be complete", () => {
  assert.equal(isConversationSnapshotRequest({}),true);
  assert.equal(isConversationSnapshotRequest({members: []}),false);
  assert.equal(isSpatialMediaTokenRequest({officeId:"office",roomKey:"zone"}),true);
  assert.equal(isSpatialMediaTokenRequest({officeId:"office",conversationId:"id"}),false);
  assert.equal(isSpatialMediaTokenRequest({officeId:"office",conversationId:"id",conversationGeneration:0,roomIncarnationId:"room"}),true);
});
