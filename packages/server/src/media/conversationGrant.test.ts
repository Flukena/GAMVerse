import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationSnapshot, SpatialMediaTokenRequest } from "@gammyverse/shared";
import { mintConversationGrant, ConversationAuthorizationError } from "./conversationGrant.js";
const REQUEST: SpatialMediaTokenRequest = { officeId: "office", roomKey: "meeting", conversationId: "conversation", conversationGeneration: 0, roomIncarnationId: "incarnation" };
function conversationSnapshot(): ConversationSnapshot {
  return {officeId: "office", roomIncarnationId: "incarnation", revision: 1, conversation: {id: "conversation", kind: "meeting", mediaTarget: {id: "meeting", generation: 0}, members: [{id: "alice", username: "alice", sessionId: "session", mediaIdentity: "media", displayName: "Alice", characterId: "character-female-a"}]}};
}
function snapshot() {
  return { snapshot: conversationSnapshot(), descriptor: { officeId: "office", roomIncarnationId: "incarnation", zoneId: "meeting", kind: "meeting" as const, generation: 0, epoch: "a".repeat(24), roomName: `zone-${"a".repeat(24)}`, available: true, state: "ready" as const } };
}
test("current membership grants exact target; default lobby, cross-office and stale bindings denied before mint", async () => {
  let minted = 0;
  const dependencies = {role: async () => "user", current: snapshot, mint: async (id: string) => { minted += 1; return id; }};
  assert.equal((await mintConversationGrant("meeting", REQUEST, dependencies)).token, "meeting");
  for (const request of [{...REQUEST, roomKey: undefined}, {...REQUEST, roomKey: "lobby"}, {...REQUEST, officeId: "other"}, {...REQUEST, conversationGeneration: 1}, {...REQUEST, conversationId: "other"}, {...REQUEST, roomIncarnationId: "other"}]) {
    await assert.rejects(mintConversationGrant("meeting", request, dependencies), ConversationAuthorizationError);
  }
  assert.equal(minted, 1);
});
test("membership denial, missing active session and revoked membership deny grants", async () => {
  let minted = false;
  const dependencies = {role: async () => null, current: snapshot, mint: async () => { minted = true; }};
  await assert.rejects(mintConversationGrant("meeting", REQUEST, dependencies), ConversationAuthorizationError);
  await assert.rejects(mintConversationGrant("meeting", REQUEST, {...dependencies, role: async () => "user", current: () => null}), ConversationAuthorizationError);
  assert.equal(minted, false);
});
test("target changes during mint and role removal during final read prevent stale tokens", async () => {
  let current = snapshot();
  await assert.rejects(mintConversationGrant("meeting", REQUEST, {
    role: async () => "user", current: () => current,
    mint: async () => { current = {...current, snapshot: {...current.snapshot, conversation: null}}; return "stale"; },
  }), ConversationAuthorizationError);
  let reads = 0;
  await assert.rejects(mintConversationGrant("meeting", REQUEST, {
    role: async () => ++reads === 1 ? "user" : null, current: snapshot, mint: async () => "stale",
  }), ConversationAuthorizationError);
});
test("legacy exact-zone requests remain supported while roster revision does not invalidate a grant", async () => {
  const current = snapshot();
  const result = await mintConversationGrant("meeting", {officeId: "office",roomKey: "meeting"}, {
    role: async () => "user", current: () => current,
    mint: async () => {current.snapshot.revision += 1; return "valid";},
  });
  assert.equal(result.token, "valid");
});

test("Listen mode passes through the authorization boundary without upgrading publish intent", async () => {
  const modes: string[] = [];
  await mintConversationGrant("meeting", {...REQUEST,mode:"listen"}, {role:async()=>"user",current:snapshot,mint:async(_id,mode)=>{modes.push(mode);return "listen";}});
  assert.deepEqual(modes,["listen"]);
});

test("rotating or mismatched zone epochs are denied before minting", async () => {
  let minted = 0;
  for (const descriptor of [
    {...snapshot().descriptor,available:false,state:"rotating" as const},
    {...snapshot().descriptor,zoneId:"other"},
    {...snapshot().descriptor,roomIncarnationId:"old-room"},
    {...snapshot().descriptor,roomName:"client-controlled-static-room"},
  ]) {
    await assert.rejects(mintConversationGrant("meeting",REQUEST,{role:async()=>"user",current:async()=>({...snapshot(),descriptor}),mint:async()=>{minted+=1;return "stale";}}));
  }
  assert.equal(minted,0);
});
test("an epoch rotation or canonical admission loss during async mint prevents stale token return", async () => {
  for (const change of ["epoch","admission"] as const) {
    let current: ReturnType<typeof snapshot> | null = snapshot();
    await assert.rejects(mintConversationGrant("meeting",REQUEST,{
      role:async()=>"user",current:async()=>current,
      mint:async()=>{
        if(change==="admission")current=null;
        else current={...snapshot(),descriptor:{...snapshot().descriptor,generation:1,epoch:"b".repeat(24),roomName:`zone-${"b".repeat(24)}`}};
        return "stale";
      },
    }),ConversationAuthorizationError);
  }
});
