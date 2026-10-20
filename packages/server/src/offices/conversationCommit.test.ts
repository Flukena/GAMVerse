import assert from "node:assert/strict";
import test from "node:test";
import { CAMPUS_WORLD, makeBlockerGrid, PlayerState, type RoomLayout, type WorldConfig } from "@gammyverse/shared";
import { OfficeRoom } from "./OfficeRoom.js";
import { planMeetRoutes, type MeetGeometry, type MeetRoutePlan, type MeetTravelParticipant } from "./meetRoutePlanner.js";
const HOST_SESSION_ID = "host-session";
const GUEST_SESSION_ID = "guest-session";
test("accepted Join-me anchors inviter by clearing old movement and commits the recipient route", () => {
  const room = new OfficeRoom();
  const host: MeetTravelParticipant = {username:"host",sessionId:HOST_SESSION_ID,displayName:"Host",x:-6,z:0,status:"available",presence:"online",active:true,vehicleId:""};
  const guest: MeetTravelParticipant = {...host,username:"guest",sessionId:GUEST_SESSION_ID,x:6};
  const geometry: MeetGeometry = {world:{...CAMPUS_WORLD,width:40,depth:40,walls:[],obstacles:[],collisionGrid:undefined},layout:{version:1,props:[],walls:[],doors:[],zones:[{id:"meeting-1",kind:"meeting",name:"Meeting",x:0,z:8,width:10,depth:10,color:"#fff"}]},lockedZoneIds:new Set(),revision:1};
  const locked = new Set<string>();
  (room as unknown as {privacy:unknown}).privacy = {access:{lockForMeeting:(id:string)=>locked.add(id)},lockedIds:()=>new Set(locked)};
  const internal = room as unknown as {navigationGeometryRevision:number;mapLayout:RoomLayout;lockedZoneIds:Set<string>;conversationActions:unknown;autoRoutes:Map<string,unknown>;movementInputs:Map<string,{x:number;z:number}>;commitConversationRoutes(plan:MeetRoutePlan,zoneId:string):void};
  internal.mapLayout=geometry.layout;internal.lockedZoneIds=new Set();
  internal.navigationGeometryRevision=geometry.revision;
  internal.conversationActions={participant:(id:string)=>id===HOST_SESSION_ID ? host : guest,participants:()=>[host,guest],invalidateApproach:()=>{}};
  for (const participant of [host,guest]) {const player=new PlayerState();player.username=participant.username;player.x=participant.x;player.z=participant.z;room.state.players.set(participant.sessionId,player);}
  internal.autoRoutes.set(HOST_SESSION_ID,{points:[{x:10,z:0}],index:0,stalledTicks:0});
  internal.movementInputs.set(HOST_SESSION_ID,{x:1,z:0});
  try {
    const plan=planMeetRoutes("join-me",host,guest,geometry);
    assert.ok(plan);
    internal.commitConversationRoutes(plan,"meeting-1");
    assert.equal(internal.autoRoutes.has(HOST_SESSION_ID),false);
    assert.deepEqual({x:internal.movementInputs.get(HOST_SESSION_ID)?.x,z:internal.movementInputs.get(HOST_SESSION_ID)?.z},{x:0,z:0});
    assert.deepEqual({x:room.state.players.get(HOST_SESSION_ID)?.x,z:room.state.players.get(HOST_SESSION_ID)?.z},{x:host.x,z:host.z});
    assert.equal(internal.autoRoutes.has(GUEST_SESSION_ID),true);
  } finally {room.clock.stop();}
});

test("live conversation commit rejects corridors through unlocked private and restroom zones", () => {
  for (const kind of ["private", "restroom"] as const) {
    const room = new OfficeRoom();
    const player = new PlayerState(); player.username = "traveler"; player.x = 0; player.z = -8; player.presence = "online";
    room.state.players.set("traveler-session", player);
    const zone = { id: "restricted", kind, name: "Restricted", x: 0, z: 0, width: 40, depth: 5, color: "#fff" };
    const internal = room as unknown as {
      world: WorldConfig; mapLayout: RoomLayout; lockedZoneIds: Set<string>; navigationGeometryRevision: number;
      conversationActions: unknown; commitConversationRoutes(plan: MeetRoutePlan): void;
    };
    internal.world = { ...CAMPUS_WORLD, width: 20, depth: 20, walls: [], obstacles: [], collisionGrid: makeBlockerGrid([]) };
    internal.mapLayout = { version: 1, props: [], walls: [], doors: [], zones: [zone] };
    internal.lockedZoneIds = new Set();
    internal.navigationGeometryRevision = 1;
    internal.conversationActions = { participant: () => ({ active: true }), participants: () => [], invalidateApproach() {} };
    const plan: MeetRoutePlan = { geometryRevision: 1, routes: [{ sessionId: "traveler-session", points: [{ x: 0, z: 8 }], destination: { x: 0, z: 8 } }] };
    try { assert.throws(() => internal.commitConversationRoutes(plan), /no longer clear/); }
    finally { room.clock.stop(); }
  }
});
