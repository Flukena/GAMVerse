import { findAutoRoute, findSeatApproachRoute } from "./routeNavigation.js";
import { isPositionWalkable } from "@gammyverse/shared";
import { RouteSearchBudget } from "./routeWorkBudget.js";
import { routeSearchWorld, type RouteSearchRequest, type RouteSearchResult, type RouteSearchSnapshot } from "./routeSearchProtocol.js";

/** Pure worker operation, also used by deterministic tests. */
export function executeRouteSearch(snapshot: RouteSearchSnapshot, request: RouteSearchRequest): RouteSearchResult {
  const world = routeSearchWorld(snapshot, request);
  if (request.mode === "seat") {
    const seat = request.seatSearch;
    if (!seat) return { points: null };
    const zone = snapshot.seatLayout?.zones.find((candidate) => candidate.id === seat.zoneId);
    if (!zone || !snapshot.seatLayout) return { points: null };
    const result = findSeatApproachRoute(
      request.start,
      zone,
      snapshot.seatLayout.props,
      world,
      new Set(seat.occupiedSeatIds),
      seat.preferredPoint,
      new RouteSearchBudget(),
    );
    return result ? { points: result.points, propId: result.propId, zoneId: result.zoneId } : { points: null };
  }
  if (request.mode === "approach") {
    for (const destination of request.approachDestinations ?? []) {
      if (!isPositionWalkable(request.start, world) || !isPositionWalkable(destination, world)) continue;
      const points = findAutoRoute(request.start, destination, world, new RouteSearchBudget());
      const arrival = points?.at(-1) ?? request.start;
      if (points && Math.hypot(arrival.x - destination.x, arrival.z - destination.z) <= 0.8) {
        return { points, destination: { x: arrival.x, z: arrival.z } };
      }
    }
    return { points: null };
  }
  if (request.mode === "meet-room") {
    for (const candidate of request.meetRoomCandidates ?? []) {
      if (![candidate.firstStart, candidate.secondStart, candidate.firstDestination, candidate.secondDestination]
        .every((point) => isPositionWalkable(point, world))) continue;
      const budget = new RouteSearchBudget();
      const first = findAutoRoute(candidate.firstStart, candidate.firstDestination, world, budget);
      if (!first) continue;
      const second = findAutoRoute(candidate.secondStart, candidate.secondDestination, world, budget);
      if (!second) continue;
      const firstArrival = first.at(-1) ?? candidate.firstStart;
      const secondArrival = second.at(-1) ?? candidate.secondStart;
      if (Math.hypot(firstArrival.x - candidate.firstDestination.x, firstArrival.z - candidate.firstDestination.z) > 0.8
          || Math.hypot(secondArrival.x - candidate.secondDestination.x, secondArrival.z - candidate.secondDestination.z) > 0.8) continue;
      return { points: [], routes: [
        { points: first, destination: { x: firstArrival.x, z: firstArrival.z } },
        { points: second, destination: { x: secondArrival.x, z: secondArrival.z } },
      ] };
    }
    return { points: null };
  }
  return { points: findAutoRoute(request.start, request.destination, world, new RouteSearchBudget()) };
}
