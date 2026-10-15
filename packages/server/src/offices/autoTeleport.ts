import { isPositionWalkable, type RoomLayoutZone, type WorldConfig } from "@gammyverse/shared";

type Position = { x: number; z: number };

const TELEPORT_LANDING_GRID_STEP_M = 0.5;
const ZONE_LANDING_INSET_M = 0.12;

/** Find the closest legal landing point to an in-bounds teleport destination. */
export function autoMoveLandingPoint(destination: Position, world: WorldConfig, zone?: RoomLayoutZone): Position | null {
  const isInsideZone = (point: Position) => !zone || (
    Math.abs(point.x - zone.x) <= zone.width / 2 - world.playerRadius - ZONE_LANDING_INSET_M
    && Math.abs(point.z - zone.z) <= zone.depth / 2 - world.playerRadius - ZONE_LANDING_INSET_M
  );
  const isLandingPoint = (point: Position) => isInsideZone(point) && isPositionWalkable(point, world);
  if (isLandingPoint(destination)) return destination;

  const step = TELEPORT_LANDING_GRID_STEP_M;
  const maxRing = Math.ceil(Math.hypot(world.width, world.depth) / step);
  for (let ring = 1; ring <= maxRing; ring += 1) {
    const candidates: Array<Position & { distanceSquared: number }> = [];
    const consider = (offsetX: number, offsetZ: number) => {
      const point = { x: destination.x + offsetX * step, z: destination.z + offsetZ * step };
      if (!isLandingPoint(point)) return;
      candidates.push({ ...point, distanceSquared: (point.x - destination.x) ** 2 + (point.z - destination.z) ** 2 });
    };

    for (let offset = -ring; offset <= ring; offset += 1) {
      consider(offset, -ring);
      consider(offset, ring);
      if (offset !== -ring && offset !== ring) {
        consider(-ring, offset);
        consider(ring, offset);
      }
    }
    if (candidates.length) {
      candidates.sort((first, second) => first.distanceSquared - second.distanceSquared);
      const { x, z } = candidates[0]!;
      return { x, z };
    }
  }
  return null;
}
