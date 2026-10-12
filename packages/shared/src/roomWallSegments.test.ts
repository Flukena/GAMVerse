import assert from "node:assert/strict";
import test from "node:test";
import { roomBoundaryWalls, roomWallSolidSegments } from "./roomWallSegments.js";
import type { RoomLayoutDoor, RoomLayoutWall } from "./roomLayout.js";

const WALL_ID = "test-wall";
const OTHER_WALL_ID = "other-wall";
const WALL_LENGTH_M = 10;
const WALL_THICKNESS_M = 0.2;
const WALL_HEIGHT_M = 3;
const DOOR_WIDTH_M = 2;
const WALL: RoomLayoutWall = { id: WALL_ID, axis: "horizontal", x: 0, z: 0, length: WALL_LENGTH_M, thickness: WALL_THICKNESS_M, height: WALL_HEIGHT_M };
const WALL_START_M = -5;
const WALL_END_M = 5;
const DOOR_START_M = -1;
const DOOR_END_M = 1;
const OVERLAP_END_M = 2;
const EDGE_START_M = 4;
const CENTER_DOOR: RoomLayoutDoor = { id: "center-door", wallId: WALL_ID, offset: 0, width: DOOR_WIDTH_M };

const MAP_WIDTH_M = 20;
const MAP_DEPTH_M = 12;
const BOUNDARY_THICKNESS_M = 0.3;
const MAP_HALF_WIDTH_M = 10;
const MAP_HALF_DEPTH_M = 6;


test("solid wall spans preserve a center doorway and ignore other walls' doors", () => {
  const unrelated = { ...CENTER_DOOR, id: "unrelated-door", wallId: OTHER_WALL_ID };
  assert.deepEqual(roomWallSolidSegments(WALL, [CENTER_DOOR, unrelated]), [{ start: WALL_START_M, end: DOOR_START_M }, { start: DOOR_END_M, end: WALL_END_M }]);
});

test("overlapping openings merge and out-of-bounds openings are clipped", () => {
  const overlap = { ...CENTER_DOOR, id: "overlapping-door", offset: DOOR_END_M };
  const edge = { ...CENTER_DOOR, id: "edge-door", offset: WALL_END_M };
  assert.deepEqual(roomWallSolidSegments(WALL, [CENTER_DOOR, overlap, edge]), [{ start: WALL_START_M, end: DOOR_START_M }, { start: OVERLAP_END_M, end: EDGE_START_M }]);
});

test("boundary footprints match the requested map dimensions", () => {
  assert.deepEqual(roomBoundaryWalls(MAP_WIDTH_M, MAP_DEPTH_M), [
    { x: 0, z: -MAP_HALF_DEPTH_M, width: MAP_WIDTH_M, depth: BOUNDARY_THICKNESS_M },
    { x: 0, z: MAP_HALF_DEPTH_M, width: MAP_WIDTH_M, depth: BOUNDARY_THICKNESS_M },
    { x: -MAP_HALF_WIDTH_M, z: 0, width: BOUNDARY_THICKNESS_M, depth: MAP_DEPTH_M },
    { x: MAP_HALF_WIDTH_M, z: 0, width: BOUNDARY_THICKNESS_M, depth: MAP_DEPTH_M },
  ]);
});
