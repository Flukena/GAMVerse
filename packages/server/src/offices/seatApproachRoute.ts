import { ROOM_PROP_CATALOG, roomPropCollisionClearanceRadius, roomPropCollisionFootprint, roomPropSeatAnchors, roomPropSeatReference, type Position, type RoomLayout, type RoomLayoutProp, type RoomLayoutZone, type RoomPropDefinition, type RoomPropSeatAnchor, type WorldConfig } from "@gammyverse/shared";
import { findAutoRoute } from "./autoRoute.js";

const SEAT_APPROACH_PADDING_M = 0.12;
const FIRST_SEAT_ANCHOR_INDEX = 0;

type SeatCandidate = { prop: RoomLayoutProp; definition: RoomPropDefinition | undefined };
type ApproachBounds = { halfWidth: number; halfDepth: number };

function approachPoints(prop: RoomLayoutProp, anchor: RoomPropSeatAnchor, bounds: ApproachBounds, start: Position) {
  const sideOffsets: Position[] = [
    { x: anchor.localX, z: -bounds.halfDepth }, { x: anchor.localX, z: bounds.halfDepth },
    { x: -bounds.halfWidth, z: anchor.localZ }, { x: bounds.halfWidth, z: anchor.localZ },
  ];
  return sideOffsets.map((offset) => ({
    x: prop.x + offset.x * Math.cos(prop.rotation) + offset.z * Math.sin(prop.rotation),
    z: prop.z - offset.x * Math.sin(prop.rotation) + offset.z * Math.cos(prop.rotation),
  })).sort((a, b) => Math.hypot(a.x - start.x, a.z - start.z) - Math.hypot(b.x - start.x, b.z - start.z));
}

function findPropApproachRoute(start: Position, seat: SeatCandidate, world: WorldConfig, occupiedSeatIds: Set<string>) {
  const { prop, definition } = seat;
  const localFootprint = roomPropCollisionFootprint({ ...prop, rotation: 0 });
  const seatClearance = roomPropCollisionClearanceRadius(prop, world.playerRadius);
  const bounds = {
    halfWidth: localFootprint.width / 2 + seatClearance + SEAT_APPROACH_PADDING_M,
    halfDepth: localFootprint.depth / 2 + seatClearance + SEAT_APPROACH_PADDING_M,
  };
  for (const anchor of roomPropSeatAnchors(prop, definition)) {
    const seatId = roomPropSeatReference(prop.id, anchor.index);
    if (occupiedSeatIds.has(seatId) || occupiedSeatIds.has(prop.id) && anchor.index === FIRST_SEAT_ANCHOR_INDEX) continue;
    for (const approach of approachPoints(prop, anchor, bounds, start)) {
      const points = findAutoRoute(start, approach, world);
      if (points) return { points, propId: seatId };
    }
  }
  return null;
}

export function findSeatApproachRoute(start: Position, zone: RoomLayoutZone, props: RoomLayout["props"], world: WorldConfig, occupiedSeatIds: Set<string>, preferredPoint: Position = start) {
  const seats = props
    .map((prop) => ({ prop, definition: ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset) }))
    .filter((entry) => entry.definition?.interaction === "sit"
      && Math.abs(entry.prop.x - zone.x) <= zone.width / 2
      && Math.abs(entry.prop.z - zone.z) <= zone.depth / 2)
    .sort((a, b) => Math.hypot(a.prop.x - preferredPoint.x, a.prop.z - preferredPoint.z) - Math.hypot(b.prop.x - preferredPoint.x, b.prop.z - preferredPoint.z));
  for (const seat of seats) {
    const route = findPropApproachRoute(start, seat, world, occupiedSeatIds);
    if (route) return { ...route, zoneId: zone.id };
  }
  return null;
}
