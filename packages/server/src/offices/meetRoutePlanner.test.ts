import assert from "node:assert/strict";
import test from "node:test";
import { CAMPUS_WORLD, campusWorldFromConfig, generateCampusMap, isPositionWalkable, makeBlockerGrid, type RoomLayoutZone } from "@gammyverse/shared";
import { isPublicMeetPoint, meetingZoneIsEmpty, planMeetRoomRoutes, planMeetRoutes, planPublicConversationApproachRoute, type MeetGeometry, type MeetTravelParticipant } from "./meetRoutePlanner.js";
const FROM: MeetTravelParticipant = { username: "alice", displayName: "Alice", sessionId: "alice-session", x: -6, z: 0, status: "available", presence: "online", active: true, vehicleId: "" };
const TO: MeetTravelParticipant = { ...FROM, username: "bob", displayName: "Bob", sessionId: "bob-session", x: 6 };
function geometry(zones: RoomLayoutZone[] = []): MeetGeometry {
  return { world: { ...CAMPUS_WORLD, width: 40, depth: 40, walls: [], obstacles: [], collisionGrid: undefined }, layout: { version: 1, props: [], zones, walls: [], doors: [] }, lockedZoneIds: new Set(), revision: 1 };
}
const PRIVATE: RoomLayoutZone = { id: "private", kind: "private", name: "Desk", x: 0, z: 0, width: 4, depth: 4, color: "#ffffff" };
test("Meet prepares two walking routes and Join-me moves only the recipient", () => {
  const map = geometry();
  const meet = planMeetRoutes("meet", FROM, TO, map)!;
  assert.equal(meet.routes.length, 2);
  assert.deepEqual(new Set(meet.routes.map(route => route.sessionId)), new Set([FROM.sessionId, TO.sessionId]));
  const join = planMeetRoutes("join-me", FROM, TO, map)!;
  const movingRoutes = join.routes.filter(route => route.points.length > 0);
  assert.deepEqual(movingRoutes.map(route => route.sessionId), [TO.sessionId]);
  assert.ok(Math.hypot(movingRoutes[0]!.destination.x - FROM.x, movingRoutes[0]!.destination.z - FROM.z) <= 2);
});
test("rendezvous and every walking waypoint remain public when private space divides the direct path", () => {
  const map = geometry([PRIVATE]);
  const plan = planMeetRoutes("meet", FROM, TO, map)!;
  assert.ok(plan);
  for (const route of plan.routes) {
    assert.ok(isPublicMeetPoint(route.destination, map));
    assert.ok(route.points.every(point => isPublicMeetPoint(point, map)));
  }
});
test("private source, suppressed availability and sealed unreachable destination reject without a partial plan", () => {
  assert.equal(planMeetRoutes("meet", { ...FROM, x: 0 }, TO, geometry([PRIVATE])), null);
  assert.equal(planMeetRoutes("meet", FROM, { ...TO, status: "away" }, geometry()), null);
  const map = geometry(); map.world = { ...map.world, walls: [{ x: 0, z: 0, width: 1, depth: 40 }] };
  assert.equal(planMeetRoutes("meet", FROM, TO, map), null);
});
test("public Approach keeps Busy navigation and permits only an unlocked target meeting", () => {
  const meeting: RoomLayoutZone = { ...PRIVATE, id: "meeting", kind: "meeting", width: 10, depth: 10 };
  const map = geometry([meeting]);
  assert.ok(planPublicConversationApproachRoute({ ...FROM, status: "do-not-disturb" }, { x: 0, z: 0 }, map, meeting.id));
  map.lockedZoneIds = new Set([meeting.id]);
  assert.equal(planPublicConversationApproachRoute(FROM, { x: 0, z: 0 }, map, meeting.id), null);
});


test("Join-me acceptance atomically anchors the inviter while the recipient walks to them", () => {
  const plan = planMeetRoutes("join-me", FROM, TO, geometry())!;
  const inviter = plan.routes.find(route => route.sessionId === FROM.sessionId);
  assert.ok(inviter, "the plan must stop the inviter's existing route and held movement");
  assert.deepEqual(inviter.points, []);
  assert.deepEqual(inviter.destination, { x: FROM.x, z: FROM.z });
  const recipient = plan.routes.find(route => route.sessionId === TO.sessionId);
  assert.ok(recipient && recipient.points.length > 0);
});


test("Meet and Join-me accept both available people inside the generated unlocked Town Hall", () => {
  const { layout } = generateCampusMap({ totalPeople: 16, peoplePerTeam: 8, teamCount: 2, seed: 1 });
  const townHall = layout.zones.find(zone => zone.id === "shared-townhall")!;
  const world = campusWorldFromConfig({ version: 1, layout });
  const points = [-8, -4, 0, 4, 8].map(offset => ({ x: townHall.x + offset, z: townHall.z + 8 })).filter(point => isPositionWalkable(point, world));
  assert.ok(points.length >= 2, "the generated public room supplies walkable meeting positions");
  const from = { ...FROM, ...points[0]! }; const to = { ...TO, ...points.at(-1)! };
  const map: MeetGeometry = { world, layout, lockedZoneIds: new Set(), revision: 1 };
  assert.equal(isPublicMeetPoint(from, map), true);
  assert.equal(isPublicMeetPoint(to, map), true);
  assert.ok(planMeetRoutes("meet", from, to, map));
  assert.ok(planMeetRoutes("join-me", from, to, map));
  map.lockedZoneIds = new Set([townHall.id]);
  assert.equal(isPublicMeetPoint(from, map), false);
  assert.equal(planMeetRoutes("meet", from, to, map), null);
});

test("unlocked meeting passages permit walking while locked and private passages remain blocked", () => {
  const meeting: RoomLayoutZone = { ...PRIVATE, id: "public-meeting", kind: "meeting", depth: 40 };
  const map = geometry([meeting]);
  const plan = planMeetRoutes("meet", FROM, TO, map);
  assert.ok(plan, "an unlocked public meeting must not act as a solid routing barrier");
  assert.ok(plan.routes.every(route => route.points.every(point => isPublicMeetPoint(point, map))));
  map.lockedZoneIds = new Set([meeting.id]);
  assert.equal(planMeetRoutes("meet", FROM, TO, map), null);
  for (const kind of ["private", "restroom"] as const) {
    const restricted = geometry([{ ...meeting, kind }]);
    assert.equal(isPublicMeetPoint({ x: 0, z: 0 }, restricted), false);
    assert.equal(planMeetRoutes("meet", FROM, TO, restricted), null);
  }
});


test("public route checks preserve blockers stored only in the source collision grid", () => {
  const map = geometry();
  const barrier = { x: 0, z: 0, width: 1, depth: map.world.depth };
  map.world = { ...map.world, collisionGrid: makeBlockerGrid([barrier]) };
  assert.equal(isPublicMeetPoint({ x: barrier.x, z: barrier.z }, map), false);
  assert.equal(planMeetRoutes("meet", FROM, TO, map), null);
});

test("meeting request routes both participants into an empty meeting room and skips occupied rooms", () => {
  const room: RoomLayoutZone = { ...PRIVATE, id: "meeting-room", kind: "meeting", x: 0, z: 8, width: 10, depth: 10 };
  const map = geometry([room]);
  assert.equal(meetingZoneIsEmpty(room, [FROM, TO]), true);
  const plan = planMeetRoomRoutes(FROM, TO, map, room);
  assert.ok(plan);
  assert.ok(plan.routes.every(route => Math.abs(route.destination.x) <= room.width / 2 && Math.abs(route.destination.z - room.z) <= room.depth / 2));
  assert.equal(meetingZoneIsEmpty(room, [{ ...TO, x: 0, z: 8 }]), false);
});
