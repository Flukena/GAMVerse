import type { RoomLayout, RoomLayoutDoor, RoomLayoutWall, RoomLayoutZone } from "./roomLayoutTypes.js";
import type { WorldConfig } from "./worldTypes.js";
import { campusWorldFromConfig } from "./worldConfig.js";
import { isPositionWalkable } from "./collision.js";

const ENTRANCE_CLEARANCE_INSET_M = 0.03;
const ENTRANCE_MIN_LATERAL_ROOM_M = 0.08;
const ENTRANCE_LATERAL_PROBE_OFFSET_M = 0.16;
const ENTRANCE_APPROACH_OFFSETS_M = [0.12, 0.85, 1.6] as const;

function entranceAccessible(zone: RoomLayoutZone, door: RoomLayoutDoor, wall: RoomLayoutWall, world: WorldConfig): boolean {
  const horizontal = wall.axis === "horizontal";
  const outwardSign = Math.sign(horizontal ? wall.z - zone.z : wall.x - zone.x);
  if (!outwardSign) return false;
  const center = horizontal
    ? { x: wall.x + door.offset, z: wall.z }
    : { x: wall.x, z: wall.z + door.offset };
  const lateralRoom = Math.max(0, door.width / 2 - world.playerRadius - ENTRANCE_CLEARANCE_INSET_M);
  const lateralOffsets = lateralRoom < ENTRANCE_MIN_LATERAL_ROOM_M
    ? [0]
    : [0, -Math.min(ENTRANCE_LATERAL_PROBE_OFFSET_M, lateralRoom), Math.min(ENTRANCE_LATERAL_PROBE_OFFSET_M, lateralRoom)];
  const approachDistances = ENTRANCE_APPROACH_OFFSETS_M.map((offset) => wall.thickness / 2 + world.playerRadius + offset);
  return approachDistances.every((distance) => lateralOffsets.every((offset) => isPositionWalkable({
    x: center.x + (horizontal ? offset : outwardSign * distance),
    z: center.z + (horizontal ? outwardSign * distance : offset),
  }, world)));
}

/** Checks that generated zone entrances have a walkable approach on the outside of the room. */
export function roomZoneEntranceIssues(layout: RoomLayout, zoneIds?: ReadonlySet<string>) {
  const world = campusWorldFromConfig({ version: 1, layout });
  const issues: Array<{ zoneId: string; doorId: string }> = [];
  for (const zone of layout.zones) {
    if (zoneIds && !zoneIds.has(zone.id)) continue;
    for (const door of layout.doors.filter((entry) => entry.id.startsWith(`${zone.id}-entrance-`))) {
      const wall = layout.walls.find((entry) => entry.id === door.wallId);
      if (!wall || !entranceAccessible(zone, door, wall, world)) issues.push({ zoneId: zone.id, doorId: door.id });
    }
  }
  return issues;
}
