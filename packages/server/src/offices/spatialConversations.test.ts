import assert from "node:assert/strict";
import test from "node:test";
import { SpatialConversations, type SpatialConversationMember } from "./spatialConversations.js";
function person(id: string, targetId: string, kind: SpatialConversationMember["kind"] = "proximity"): SpatialConversationMember {
  return {id, username: id, sessionId: `${id}-session`, mediaIdentity: `${id}-media`, displayName: id, characterId: "character-female-a", kind, targetId};
}
test("three-person merge and split retain one logical identity and rotate transport generation", () => {
  const state = new SpatialConversations("office");
  state.reconcile([person("alice", "ab"), person("bob", "ab")]);
  const original = state.snapshot("alice-session").conversation!;
  state.reconcile([person("alice", "abc"), person("bob", "abc"), person("carol", "abc")]);
  for (const id of ["alice", "bob", "carol"]) {
    const merged = state.snapshot(`${id}-session`).conversation!;
    assert.equal(merged.id, original.id);
    assert.equal(merged.mediaTarget.generation, original.mediaTarget.generation + 1);
    assert.deepEqual(merged.members.map(member => member.id), ["alice", "bob", "carol"]);
  }
  state.reconcile([person("alice", "ab"), person("bob", "ab")]);
  assert.equal(state.snapshot("alice-session").conversation!.id, original.id);
  assert.equal(state.snapshot("carol-session").conversation, null);
});
test("split assigns old identity once with greatest overlap and merge preserves greatest overlap", () => {
  const state = new SpatialConversations("office");
  state.reconcile(["a", "b", "c", "d", "e"].map(id => person(id, "all")));
  const id = state.snapshot("a-session").conversation!.id;
  state.reconcile([person("a", "ab"), person("b", "ab"), person("c", "cde"), person("d", "cde"), person("e", "cde")]);
  assert.notEqual(state.snapshot("a-session").conversation!.id, id);
  assert.equal(state.snapshot("c-session").conversation!.id, id);
  state.reconcile(["a", "b", "c", "d", "e"].map(name => person(name, "all-again")));
  assert.equal(state.snapshot("a-session").conversation!.id, id);
});
test("profile changes revise snapshot without media generation churn; repeated requests and reconciliation are idempotent", () => {
  const state = new SpatialConversations("office");
  const alice = person("alice", "meeting", "meeting");
  state.reconcile([alice]);
  const first = state.snapshot(alice.sessionId);
  assert.equal(state.reconcile([alice]), false);
  assert.deepEqual(state.snapshot(alice.sessionId), first);
  state.reconcile([{...alice, displayName: "Alice Updated"}]);
  const next = state.snapshot(alice.sessionId);
  assert.ok(next.revision > first.revision);
  assert.equal(next.conversation!.mediaTarget.generation, first.conversation!.mediaTarget.generation);
  assert.equal(next.conversation!.id, first.conversation!.id);
  next.conversation!.members.length = 0;
  assert.equal(state.snapshot(alice.sessionId).conversation!.members.length, 1);
});
test("drop removes membership and rejoin uses current session; fresh room gets different incarnation", () => {
  const state = new SpatialConversations("office");
  state.reconcile([person("alice", "desk", "private"),person("bob", "desk", "private")]);
  state.reconcile([person("bob", "desk", "private")]);
  assert.equal(state.snapshot("alice-session").conversation, null);
  state.reconcile([{...person("alice", "desk", "private"), sessionId: "replacement"},person("bob", "desk", "private")]);
  assert.equal(state.snapshot("alice-session").conversation, null);
  assert.equal(state.snapshot("replacement").conversation!.members.length, 2);
  assert.notEqual(new SpatialConversations("office").roomIncarnationId, state.roomIncarnationId);
});

test("private epoch readiness changes transport without changing identity and lease stamps are recipient-specific", () => {
  const state = new SpatialConversations("office");
  const alice = {...person("alice","desk","private"),mediaTarget:{id:"desk",generation:1,available:true}};
  const bob = {...person("bob","desk","private"),mediaTarget:alice.mediaTarget,admissionLeaseId:"approved-lease"};
  state.reconcile([alice,bob]);
  const original = state.snapshot("bob-session");
  assert.equal(original.admissionLeaseId,"approved-lease");
  assert.equal(state.snapshot("alice-session").admissionLeaseId,undefined);
  assert.equal("admissionLeaseId" in original.conversation!.members[1]!,false);
  state.reconcile([{...alice,mediaTarget:{id:"desk",generation:2,available:false}},{...bob,mediaTarget:{id:"desk",generation:2,available:false}}]);
  const rotating = state.snapshot("bob-session");
  assert.equal(rotating.conversation!.id,original.conversation!.id);
  assert.equal(rotating.admissionLeaseId,original.admissionLeaseId);
  assert.equal(rotating.conversation!.mediaTarget.available,false);
  assert.ok(rotating.revision>original.revision);
});
