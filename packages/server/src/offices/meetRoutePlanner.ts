import { restrictedZoneWorld } from "./privateMovement.js";
import { availabilityPolicy, isPositionWalkable, type MeetOfferKind, type MeetParty, type Position, type RoomLayout, type RoomLayoutZone, type WorldConfig } from "@gammyverse/shared";
import { findAutoRoute } from "./autoRoute.js";

export type MeetTravelParticipant = MeetParty & Position & { status: string; presence: string; active: boolean; vehicleId: string };
export type MeetGeometry = { world: WorldConfig; layout: RoomLayout; lockedZoneIds: ReadonlySet<string>; revision: number };
export type MeetWalkingRoute = { sessionId: string; points: Position[]; destination: Position };
export type MeetRoutePlan = { routes: MeetWalkingRoute[]; geometryRevision: number };
const RENDEZVOUS_SEARCH_RADII_M = [0, 2, 4] as const;
const RENDEZVOUS_SEARCH_DIRECTION_COUNT = 4;
const PARTICIPANT_SEPARATION_M = 1.5;
const ARRIVAL_TOLERANCE_M = 0.8;
export function meetingZoneIsPublic(zone: RoomLayoutZone, geometry: MeetGeometry) {
  return zone.kind === "meeting" && !geometry.lockedZoneIds.has(zone.id);
}
export function publicNavigationDeniedZones(geometry: MeetGeometry): RoomLayoutZone[] {
  return geometry.layout.zones.filter(zone => !meetingZoneIsPublic(zone, geometry));
}
function publicWorld(geometry: MeetGeometry): WorldConfig {
  return restrictedZoneWorld(geometry.world, publicNavigationDeniedZones(geometry));
}
export function meetParticipantAvailable(participant: MeetTravelParticipant) {
  return participant.active && participant.presence === "online" && !participant.vehicleId && !availabilityPolicy(participant.status).suppressInterruptions;
}
export function isPublicMeetPoint(point: Position, geometry: MeetGeometry) {
  return isPositionWalkable(point, publicWorld(geometry));
}
function* candidates(target: Position): Generator<Position> {
  yield target;
  for (const radiusM of RENDEZVOUS_SEARCH_RADII_M) {
    if (!radiusM) continue;
    for (let direction = 0; direction < RENDEZVOUS_SEARCH_DIRECTION_COUNT; direction += 1) {
      const angle = direction * Math.PI * 2 / RENDEZVOUS_SEARCH_DIRECTION_COUNT;
      yield { x: target.x + Math.cos(angle) * radiusM, z: target.z + Math.sin(angle) * radiusM };
    }
  }
}
export function publicConversationApproachCandidates(target: Position): Position[] {
  return [...candidates(target)].map(point => ({ x: point.x, z: point.z }));
}
export function meetRoomRouteCandidates(from: MeetTravelParticipant, to: MeetTravelParticipant, zone: RoomLayoutZone) {
  const result: Array<{ firstStart: Position; firstDestination: Position; secondStart: Position; secondDestination: Position }> = [];
  const offsets = [PARTICIPANT_SEPARATION_M / 2, -PARTICIPANT_SEPARATION_M / 2];
  for (const offset of [0, -0.5, 0.5, -1, 1]) {
    result.push({
      firstStart: { x: from.x, z: from.z },
      firstDestination: { x: zone.x + offset, z: zone.z - offsets[0] },
      secondStart: { x: to.x, z: to.z },
      secondDestination: { x: zone.x + offset, z: zone.z + offsets[1] },
    });
  }
  return result;
}
function routeTo(participant: MeetTravelParticipant, destination: Position, world: WorldConfig): MeetWalkingRoute | null {
  if (!isPositionWalkable(participant, world) || !isPositionWalkable(destination, world)) return null;
  const points = findAutoRoute(participant, destination, world);
  if (!points) return null;
  const arrival = points.at(-1) ?? participant;
  if (Math.hypot(arrival.x - destination.x, arrival.z - destination.z) > ARRIVAL_TOLERANCE_M) return null;
  return { sessionId: participant.sessionId, points, destination: { x: arrival.x, z: arrival.z } };
}
export function planApproachRoute(participant: MeetTravelParticipant, target: Position, geometry: MeetGeometry): MeetWalkingRoute | null {
  if (!meetParticipantAvailable(participant)) return null;
  return approachRoute(participant, target, publicWorld(geometry));
}
function approachRoute(participant: MeetTravelParticipant, target: Position, world: WorldConfig) {
  for (const destination of candidates(target)) {
    const route = routeTo(participant, destination, world);
    if (route) return route;
  }
  return null;
}
export function planPublicConversationApproachRoute(participant: MeetTravelParticipant, target: Position, geometry: MeetGeometry, targetMeetingZoneId?: string): MeetWalkingRoute | null {
  if (!participant.active || participant.presence !== "online" || participant.vehicleId) return null;
  if (targetMeetingZoneId && !geometry.layout.zones.some(zone => zone.id === targetMeetingZoneId && meetingZoneIsPublic(zone, geometry))) return null;
  return approachRoute(participant, target, publicWorld(geometry));
}
function rendezvous(from: MeetTravelParticipant, to: MeetTravelParticipant, geometry: MeetGeometry): MeetRoutePlan | null {
  const world = publicWorld(geometry);
  const midpoint = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
  for (const center of candidates(midpoint)) {
    const first = routeTo(from, { x: center.x - PARTICIPANT_SEPARATION_M / 2, z: center.z }, world);
    if (!first) continue;
    const second = routeTo(to, { x: center.x + PARTICIPANT_SEPARATION_M / 2, z: center.z }, world);
    if (second) return { routes: [first, second], geometryRevision: geometry.revision };
  }
  return null;
}
export function planMeetRoutes(kind: MeetOfferKind, from: MeetTravelParticipant, to: MeetTravelParticipant, geometry: MeetGeometry): MeetRoutePlan | null {
  if (!meetParticipantAvailable(from) || !meetParticipantAvailable(to) || !isPublicMeetPoint(from, geometry) || !isPublicMeetPoint(to, geometry)) return null;
  if (kind === "meet") return rendezvous(from, to, geometry);
  const target = { x: from.x + PARTICIPANT_SEPARATION_M, z: from.z };
  const route = planApproachRoute(to, target, geometry);
  const anchor = { sessionId: from.sessionId, points: [], destination: { x: from.x, z: from.z } };
  return route ? { routes: [anchor, route], geometryRevision: geometry.revision } : null;
}

export function planMeetRoomRoutes(from: MeetTravelParticipant, to: MeetTravelParticipant, geometry: MeetGeometry, zone: RoomLayoutZone): MeetRoutePlan | null {
  if (zone.kind !== "meeting" || geometry.lockedZoneIds.has(zone.id)
    || !meetParticipantAvailable(from) || !meetParticipantAvailable(to)
    || !isPublicMeetPoint(from, geometry) || !isPublicMeetPoint(to, geometry)) return null;
  const world = publicWorld(geometry);
  const centerX = zone.x;
  const centerZ = zone.z;
  const offsets = [PARTICIPANT_SEPARATION_M / 2, -PARTICIPANT_SEPARATION_M / 2];
  for (const offset of [0, -0.5, 0.5, -1, 1]) {
    const first = routeTo(from, { x: centerX + offset, z: centerZ - offsets[0] }, world);
    const second = routeTo(to, { x: centerX + offset, z: centerZ + offsets[1] }, world);
    if (first && second) return { routes: [first, second], geometryRevision: geometry.revision };
  }
  return null;
}

export function meetingZoneIsEmpty(zone: RoomLayoutZone, participants: readonly MeetTravelParticipant[]) {
  return zone.kind === "meeting" && !participants.some(person => person.active && person.presence === "online"
    && person.x >= zone.x - zone.width / 2 && person.x <= zone.x + zone.width / 2
    && person.z >= zone.z - zone.depth / 2 && person.z <= zone.z + zone.depth / 2);
}
