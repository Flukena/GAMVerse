import type { RoomLayoutDoor, RoomLayoutWall } from "./roomLayoutTypes.js";

const ROOM_BOUNDARY_THICKNESS_M = 0.3;

export type WallSegment = { start: number; end: number };

/** Solid wall spans, excluding doorways and merging overlapping openings. */
export function roomWallSolidSegments(wall: RoomLayoutWall, doors: readonly RoomLayoutDoor[]): WallSegment[] {
  const halfLengthM = wall.length / 2;
  const gaps = doors.filter((door) => door.wallId === wall.id)
    .map((door) => ({ start: Math.max(-halfLengthM, door.offset - door.width / 2), end: Math.min(halfLengthM, door.offset + door.width / 2) }))
    .filter((gap) => gap.end > gap.start)
    .sort((first, second) => first.start - second.start);
  const segments: WallSegment[] = [];
  let cursorM = -halfLengthM;
  for (const gap of gaps) {
    if (gap.start > cursorM) segments.push({ start: cursorM, end: gap.start });
    cursorM = Math.max(cursorM, gap.end);
  }
  if (cursorM < halfLengthM) segments.push({ start: cursorM, end: halfLengthM });
  return segments;
}

/** Centered map-boundary footprints used by movement and camera collision. */
export function roomBoundaryWalls(widthM: number, depthM: number) {
  return [
    { x: 0, z: -depthM / 2, width: widthM, depth: ROOM_BOUNDARY_THICKNESS_M },
    { x: 0, z: depthM / 2, width: widthM, depth: ROOM_BOUNDARY_THICKNESS_M },
    { x: -widthM / 2, z: 0, width: ROOM_BOUNDARY_THICKNESS_M, depth: depthM },
    { x: widthM / 2, z: 0, width: ROOM_BOUNDARY_THICKNESS_M, depth: depthM },
  ];
}
