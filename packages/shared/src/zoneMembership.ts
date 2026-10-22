import type { RoomLayoutZone } from "./roomLayoutTypes.js";

export const ZONE_EXIT_MARGIN_M = 0.5;
const RECTANGLE_HALF_DIVISOR = 2;

function distanceToZoneM(position: { x: number; z: number }, zone: RoomLayoutZone): number {
  const outsideX = Math.max(0, Math.abs(position.x - zone.x) - zone.width / RECTANGLE_HALF_DIVISOR);
  const outsideZ = Math.max(0, Math.abs(position.z - zone.z) - zone.depth / RECTANGLE_HALF_DIVISOR);
  return Math.hypot(outsideX, outsideZ);
}

/** Only retains existing membership. New entries always require actual containment. */
export function zoneAtWithExitMargin(position: { x: number; z: number }, zones: RoomLayoutZone[], previousZoneId?: string | null): RoomLayoutZone | null {
  const mediaZones = zones.filter(zone => zone.kind !== "restroom");
  const containing = mediaZones.filter(zone => distanceToZoneM(position, zone) === 0)
    .sort((a, b) => a.width * a.depth - b.width * b.depth)[0] ?? null;
  const previous = mediaZones.find(zone => zone.id === previousZoneId);
  if (!previous || distanceToZoneM(position, previous) > ZONE_EXIT_MARGIN_M) return containing;
  if (containing && containing.width * containing.depth < previous.width * previous.depth) return containing;
  return previous;
}
