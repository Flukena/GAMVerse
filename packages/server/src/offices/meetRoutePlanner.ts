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
function meetingZoneIsPublic(zone: RoomLayoutZone, geometry: MeetGeometry) {
  return zone.kind === "meeting" && !geometry.lockedZoneIds.has(zone.id);
}
function publicWorld(geometry: MeetGeometry): WorldConfig {
  const restrictedZones = geometry.layout.zones.filter(zone => !meetingZoneIsPublic(zone, geometry));
  return restrictedZoneWorld(geometry.world, restrictedZones);
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
