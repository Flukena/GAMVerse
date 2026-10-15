import assert from "node:assert/strict";
import test from "node:test";
import { isValidPrivateZoneCommand, isValidPrivateZoneAccessRequest, isValidPrivateZoneAccessSnapshot } from "./privateConversations.js";
import { isConversationSnapshot } from "./conversation.js";
test("private commands accept only bounded identity-free intents and explicit action fields", () => {
  const command = {zoneId: "zone", requestId: "request", expectedRevision: 1, action: "admit", knockId: "knock"};
  assert.equal(isValidPrivateZoneCommand(command), true);
  assert.equal(isValidPrivateZoneCommand({...command, username: "admin"}), false);
  assert.equal(isValidPrivateZoneCommand({...command, x: 100}), false);
  assert.equal(isValidPrivateZoneCommand({...command, expectedRevision: -1}), false);
  assert.equal(isValidPrivateZoneCommand({...command, knockId: undefined}), false);
  assert.equal(isValidPrivateZoneAccessRequest({zoneId: "zone", requestId: "request"}), true);
});
test("availability and actor lease extensions are optional and strictly typed", () => {
  const person = {id: "alice", username: "alice", sessionId: "session", displayName: "Alice", characterId: "character", mediaIdentity: "identity"};
  const conversation = {id: "conversation", kind: "private", mediaTarget: {id: "zone", generation: 1}, members: [person]};
  const snapshot = {officeId: "office", roomIncarnationId: "room", revision: 1, conversation};
  assert.equal(isConversationSnapshot(snapshot), true);
  assert.equal(isConversationSnapshot({...snapshot, conversation: {...conversation, mediaTarget: {...conversation.mediaTarget, available: false}}, admissionLeaseId: "lease"}), true);
  assert.equal(isConversationSnapshot({...snapshot, conversation: {...conversation, mediaTarget: {...conversation.mediaTarget, available: "false"}}}), false);
  assert.equal(isConversationSnapshot({...snapshot, admissionLeaseId: 1}), false);
});
test("access snapshot does not accept malformed capabilities or unbounded request queues", () => {
  const capabilities = {lock:false,unlock:false,knock:true,cancelKnock:false,admit:false,revoke:false,retryMedia:false};
  const snapshot = {officeId:"office",roomIncarnationId:"room",zoneId:"zone",revision:1,locked:true,transportState:"ready",access:"blocked",leaseExpiresAtMs:null,capabilities,ownKnock:null,pendingKnocks:[],revocableGuests:[]};
  assert.equal(isValidPrivateZoneAccessSnapshot(snapshot),true);
  assert.equal(isValidPrivateZoneAccessSnapshot({...snapshot,capabilities:{...capabilities,admit:"yes"}}),false);
  assert.equal(isValidPrivateZoneAccessSnapshot({...snapshot,pendingKnocks:[{id:"bad"}]}),false);
});
