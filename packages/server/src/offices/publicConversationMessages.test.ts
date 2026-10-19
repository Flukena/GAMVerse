import assert from "node:assert/strict";
import test from "node:test";
import { CAMPUS_WORLD, type PublicConversationSummary } from "@gammyverse/shared";
import { PublicConversationMessages, type PublicConversationState } from "./publicConversationMessages.js";
import { PublicConversations } from "./publicConversations.js";
import type { MeetGeometry, MeetRoutePlan, MeetTravelParticipant } from "./meetRoutePlanner.js";
function fixture() {
  let nowMs = 1000;
  let authorized = true;
  let authorize = async () => authorized;
  const participant: MeetTravelParticipant = {username:"alice",sessionId:"session",displayName:"Alice",x:-6,z:0,status:"away",presence:"online",active:true,vehicleId:""};
  let conversation: PublicConversationSummary | undefined = {id:"conversation",kind:"proximity",name:"Nearby",participantNames:["Bob"],participantCount:1,location:{x:6,z:0}};
  const geometry: MeetGeometry = {world:{...CAMPUS_WORLD,width:40,depth:40,walls:[],obstacles:[],collisionGrid:undefined},layout:{version:1,props:[],walls:[],doors:[],zones:[]},lockedZoneIds:new Set(),revision:1};
  const commits: MeetRoutePlan[] = [];
  const sent: {event:string;payload:unknown}[] = [];
  const state: PublicConversationState = {participant:()=>participant,authorize:()=>authorize(),conversation:()=>conversation ? {summary:conversation} : undefined,geometry:()=>geometry,commit:plan=>{commits.push(plan);},navigationIntent:()=>{}};
  const discovery = new PublicConversations("office","incarnation");
  const messages = new PublicConversationMessages(state,discovery,()=>nowMs);
  const client = {sessionId:"session",send:(event:string,payload:unknown)=>{sent.push({event,payload});}};
  return {messages,client,commits,sent,participant,geometry,deny:()=>{authorized=false;},remove:()=>{conversation=undefined;},advance:()=>{nowMs+=1000;},authorize:(read:()=>Promise<boolean>)=>{authorize=read;}};
}
test("Approach navigates Busy using server destination and never changes media membership",async()=>{
  const f=fixture();await f.messages.approach(f.client,{conversationId:"conversation",requestId:"request"});
  assert.equal(f.commits.length,1);
  assert.ok(Math.hypot(f.commits[0]!.routes[0]!.destination.x-6,f.commits[0]!.routes[0]!.destination.z)<=1);
  assert.equal(f.sent.some(event=>event.event==="conversation-snapshot"),false);
  assert.equal(f.sent.some(event=>event.event==="approach-conversation-result"),true);
});
test("stale conversation, role denial and injected coordinates cannot create routes",async()=>{
  for(const mode of ["stale","denied","coords"] as const){
    const f=fixture();if(mode==="stale")f.remove();if(mode==="denied")f.deny();
    await f.messages.approach(f.client,{conversationId:"conversation",requestId:"request",...(mode==="coords"?{x:999,z:999}:{})});
    assert.equal(f.commits.length,0,mode);
  }
});
test("new intent during authorization cancels pending approach; command work is rate limited",async()=>{
  const f=fixture();let release!:()=>void;
  f.authorize(()=>new Promise(resolve=>{release=()=>resolve(true);}));
  const pending=f.messages.approach(f.client,{conversationId:"conversation",requestId:"first"});
  await f.messages.approach(f.client,{conversationId:"conversation",requestId:"second"});
  f.messages.invalidate(f.client.sessionId);release();await pending;
  assert.equal(f.commits.length,0);
  assert.equal(f.sent.some(event=>event.event==="auto-move-status"),true);
});
test("latest geometry blocks routes and inactive requesters cannot read discovery",async()=>{
  const f=fixture();f.geometry.world={...f.geometry.world,walls:[{x:0,z:0,width:1,depth:40}]};
  await f.messages.approach(f.client,{conversationId:"conversation",requestId:"request"});
  assert.equal(f.commits.length,0);
  f.participant.active=false;const count=f.sent.length;f.messages.sync(f.client,{});assert.equal(f.sent.length,count);
});
