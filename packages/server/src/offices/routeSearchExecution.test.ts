import assert from "node:assert/strict";
import test from "node:test";
import { makeBlockerGrid, ROOM_PROP_CATALOG, WORLD, roomPropSeatAnchors, roomPropSeatReference, type RoomLayoutProp, type RoomLayoutZone } from "@gammyverse/shared";
import { executeRouteSearch } from "./routeSearchExecution.js";
import type { RouteSearchRequest, RouteSearchSnapshot } from "./routeSearchProtocol.js";
import { publicNavigationDeniedZones } from "./meetRoutePlanner.js";

const chairDefinition = ROOM_PROP_CATALOG.find((item) => item.asset === "chair")!;
const zone: RoomLayoutZone = { id: "meeting", kind: "meeting", name: "Meeting", x: 0, z: 0, width: 10, depth: 10, color: "#ffffff" };
const chair: RoomLayoutProp = { id: "bench", asset: chairDefinition.asset, x: 0, z: 0, width: 3, depth: 1, rotation: 0, collision: false };
const snapshot: RouteSearchSnapshot = {
  roomId: "room", revision: 1,
  world: { ...WORLD, width: 20, depth: 20, walls: [], obstacles: [], collisionGrid: undefined },
  seatLayout: { props: [chair], zones: [zone] },
};
const request = (overrides: Partial<RouteSearchRequest> = {}): RouteSearchRequest => ({
  roomId: "room", sessionId: "session", requestId: "seat", revision: 1,
  start: { x: 0, z: -4 }, destination: { x: 0, z: -4 }, priority: "seat", mode: "seat",
  seatSearch: { zoneId: zone.id, occupiedSeatIds: [], preferredPoint: { x: 0, z: -4 } },
  ...overrides,
});

test("seat worker searches cached map seats and applies current occupancy and access overlays", () => {
  const result = executeRouteSearch(snapshot, request());
  assert.equal(result.zoneId, zone.id);
  assert.equal(result.propId, roomPropSeatReference(chair.id, 0));
  assert.ok(result.points?.length);

  const occupied = executeRouteSearch(snapshot, request({ seatSearch: {
    zoneId: zone.id,
    occupiedSeatIds: [0, 1, 2].map((index) => roomPropSeatReference(chair.id, index)),
    preferredPoint: { x: 0, z: -4 },
  } }));
  assert.equal(occupied.points, null, "all occupied seats are skipped");

  const denied = executeRouteSearch(snapshot, request({ accessBlockers: [{ x: 0, z: 0, width: 20, depth: 20 }] }));
  assert.equal(denied.points, null, "caller-specific access blockers are applied to seat approaches");
  const vehicleBlocked = executeRouteSearch(snapshot, request({ dynamicCollisionGrid: makeBlockerGrid([{ x: 0, z: 0, width: 20, depth: 20 }]) }));
  assert.equal(vehicleBlocked.points, null, "moving vehicle blockers are applied to seat approaches");
  assert.deepEqual(snapshot.seatLayout?.props, [chair], "worker evaluation does not mutate cached seat geometry");
});

test("seat worker searches beyond the first 128 props for an unoccupied seat", () => {
  const props = Array.from({ length: 200 }, (_, index): RoomLayoutProp => ({
    id: `seat-${index}`, asset: chair.asset, x: -100 + index, z: 0, width: 1, depth: 1, rotation: 0, collision: false,
  }));
  const manySeatSnapshot: RouteSearchSnapshot = {
    ...snapshot,
    world: { ...snapshot.world, width: 500, depth: 100 },
    seatLayout: { props, zones: [{ ...zone, width: 400, depth: 20 }] },
  };
  const occupiedSeatIds = props.slice(0, 199).flatMap((prop) => roomPropSeatAnchors(prop, chairDefinition).map((anchor) => roomPropSeatReference(prop.id, anchor.index)));
  const result = executeRouteSearch(manySeatSnapshot, request({
    start: { x: -100, z: -4 },
    destination: { x: -100, z: -4 },
    seatSearch: { zoneId: zone.id, occupiedSeatIds, preferredPoint: { x: -100, z: -4 } },
  }));
  assert.equal(result.propId, roomPropSeatReference("seat-199", 0));
});

test("conversation worker searches server-provided approach candidates and paired meeting candidates", () => {
  const approach = executeRouteSearch(snapshot, request({
    mode: "approach",
    start: { x: -6, z: 0 },
    destination: { x: 6, z: 0 },
    approachDestinations: [{ x: 0, z: 20 }, { x: 6, z: 0 }],
  }));
  assert.ok(approach.points);
  assert.deepEqual(approach.destination, { x: 6, z: 0 });

  const paired = executeRouteSearch(snapshot, request({
    mode: "meet-room",
    meetRoomCandidates: [
      { firstStart: { x: -6, z: 0 }, firstDestination: { x: 0, z: 20 }, secondStart: { x: 6, z: 0 }, secondDestination: { x: 1, z: 20 } },
      { firstStart: { x: -6, z: 0 }, firstDestination: { x: -1, z: 0 }, secondStart: { x: 6, z: 0 }, secondDestination: { x: 1, z: 0 } },
    ],
  }));
  assert.equal(paired.routes?.length, 2);
  assert.deepEqual(paired.routes?.map(route => route.destination), [{ x: -1, z: 0 }, { x: 1, z: 0 }]);

  const blockedPair = executeRouteSearch(snapshot, request({
    mode: "meet-room",
    accessBlockers: [{ x: 0, z: 0, width: 20, depth: 20 }],
    meetRoomCandidates: [
      { firstStart: { x: -6, z: 0 }, firstDestination: { x: -1, z: 0 }, secondStart: { x: 6, z: 0 }, secondDestination: { x: 1, z: 0 } },
    ],
  }));
  assert.equal(blockedPair.points, null, "both participants respect the same server-derived restricted-zone overlay");
});

test("public conversation routing blocks unlocked private and restroom zones but allows public meeting rooms", () => {
  const privateZone = { id: "private", kind: "private" as const, name: "Office", x: 0, z: 0, width: 40, depth: 5, color: "#fff" };
  const restroom = { id: "restroom", kind: "restroom" as const, name: "Restroom", x: 0, z: 0, width: 40, depth: 5, color: "#fff" };
  const publicMeetingZone = { id: "public-meeting", kind: "meeting" as const, name: "Meeting", x: 0, z: 0, width: 40, depth: 5, color: "#fff" };
  const world = { ...snapshot.world, width: 20, depth: 20 };
  const geometry = (zones: RoomLayoutZone[]) => ({ world, layout: { version: 1 as const, props: [], walls: [], doors: [], zones }, lockedZoneIds: new Set<string>(), revision: 1 });
  assert.deepEqual(publicNavigationDeniedZones(geometry([privateZone, restroom, publicMeetingZone])).map(zone => zone.id), ["private", "restroom"]);
  for (const deniedZone of [privateZone, restroom]) {
    const blocked = executeRouteSearch(snapshot, request({
      mode: "approach", start: { x: 0, z: -8 }, destination: { x: 0, z: 8 }, approachDestinations: [{ x: 0, z: 8 }],
      accessBlockers: publicNavigationDeniedZones(geometry([deniedZone])),
    }));
    assert.equal(blocked.points, null, "public routes cannot cross unlocked " + deniedZone.kind + " zones");
  }
  const publicMeeting = executeRouteSearch(snapshot, request({
    mode: "approach", start: { x: 0, z: -8 }, destination: { x: 0, z: 8 }, approachDestinations: [{ x: 0, z: 8 }],
    accessBlockers: publicNavigationDeniedZones(geometry([publicMeetingZone])),
  }));
  assert.ok(publicMeeting.points, "an unlocked meeting zone remains public and can be crossed");
});
