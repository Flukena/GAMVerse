import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_CONVERSATIONS_MAX_COUNT, isApproachConversationIntent, isConversationListeningMode, isPublicConversationsSnapshot } from "./conversationListening.js";
import { isSpatialMediaTokenRequest } from "./conversation.js";
test("Listen mode is validated and Off cannot request a token", () => {
  assert.equal(isConversationListeningMode("off"),true);
  assert.equal(isSpatialMediaTokenRequest({officeId:"office",mode:"listen"}),true);
  assert.equal(isSpatialMediaTokenRequest({officeId:"office",mode:"join"}),true);
  assert.equal(isSpatialMediaTokenRequest({officeId:"office",mode:"off"}),false);
});
test("Approach carries only conversation ID and correlated request, never coordinates", () => {
  assert.equal(isApproachConversationIntent({conversationId:"conversation",requestId:"request"}),true);
  assert.equal(isApproachConversationIntent({conversationId:"conversation",requestId:"request",x:1,z:2}),false);
  assert.equal(isApproachConversationIntent({conversationId:"conversation",requestId:""}),false);
});
test("discovery rejects invalid location and excessive lists", () => {
  const conversation = {id:"conversation",kind:"meeting",name:"Meeting",participantNames:["Alice"],participantCount:1,location:{x:1,z:2}};
  const snapshot = {officeId:"office",roomIncarnationId:"room",revision:1,conversations:[conversation]};
  assert.equal(isPublicConversationsSnapshot(snapshot),true);
  assert.equal(isPublicConversationsSnapshot({...snapshot,conversations:Array.from({length:PUBLIC_CONVERSATIONS_MAX_COUNT+1},()=>conversation)}),false);
  assert.equal(isPublicConversationsSnapshot({...snapshot,conversations:[{...conversation,kind:"private"}]}),false);
  assert.equal(isPublicConversationsSnapshot({...snapshot,conversations:[{...conversation,location:{x:Infinity,z:0}}]}),false);
});
