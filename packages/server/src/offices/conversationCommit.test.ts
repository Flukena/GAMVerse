import assert from "node:assert/strict";
import test from "node:test";
import { CAMPUS_WORLD, PlayerState } from "@gammyverse/shared";
import { OfficeRoom } from "./OfficeRoom.js";
import { planMeetRoutes, type MeetGeometry, type MeetRoutePlan, type MeetTravelParticipant } from "./meetRoutePlanner.js";
const HOST_SESSION_ID = "host-session";
const GUEST_SESSION_ID = "guest-session";
test("accepted Join-me anchors inviter by clearing old movement and commits the recipient route", () => {
  const room = new OfficeRoom();
  const host: MeetTravelParticipant = {username:"host",sessionId:HOST_SESSION_ID,displayName:"Host",x:-6,z:0,status:"available",presence:"online",active:true,vehicleId:""};
  const guest: MeetTravelParticipant = {...host,username:"guest",sessionId:GUEST_SESSION_ID,x:6};
  const geometry: MeetGeometry = {world:{...CAMPUS_WORLD,width:40,depth:40,walls:[],obstacles:[],collisionGrid:undefined},layout:{version:1,props:[],walls:[],doors:[],zones:[]},lockedZoneIds:new Set(),revision:1};
  const internal = room as unknown as {navigationGeometryRevision:number;conversationActions:unknown;autoRoutes:Map<string,unknown>;movementInputs:Map<string,{x:number;z:number}>;commitConversationRoutes(plan:MeetRoutePlan):void};
  internal.navigationGeometryRevision=geometry.revision;
  internal.conversationActions={participant:(id:string)=>id===HOST_SESSION_ID ? host : guest,invalidateApproach:()=>{}};
  for (const participant of [host,guest]) {const player=new PlayerState();player.username=participant.username;player.x=participant.x;player.z=participant.z;room.state.players.set(participant.sessionId,player);}
  internal.autoRoutes.set(HOST_SESSION_ID,{points:[{x:10,z:0}],index:0,stalledTicks:0});
  internal.movementInputs.set(HOST_SESSION_ID,{x:1,z:0});
  try {
    const plan=planMeetRoutes("join-me",host,guest,geometry);
    assert.ok(plan);
    internal.commitConversationRoutes(plan);
    assert.equal(internal.autoRoutes.has(HOST_SESSION_ID),false);
    assert.deepEqual({x:internal.movementInputs.get(HOST_SESSION_ID)?.x,z:internal.movementInputs.get(HOST_SESSION_ID)?.z},{x:0,z:0});
    assert.deepEqual({x:room.state.players.get(HOST_SESSION_ID)?.x,z:room.state.players.get(HOST_SESSION_ID)?.z},{x:host.x,z:host.z});
    assert.equal(internal.autoRoutes.has(GUEST_SESSION_ID),true);
  } finally {room.clock.stop();}
});
