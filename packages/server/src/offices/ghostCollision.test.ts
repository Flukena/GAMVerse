import assert from "node:assert/strict";
import test from "node:test";
import { CAMPUS_WORLD, campusWorldFromConfig, isPositionWalkable, movePlayer, type WorldConfig } from "@gammyverse/shared";
import { ghostCollisionWorld, movementBlockedByProps } from "./ghostCollision.js";

test("ghost collision removes prop and car blockers but keeps every wall blocker", () => {
  const world: WorldConfig = {
    ...CAMPUS_WORLD,
    width: 20,
    depth: 20,
    walls: [{ x: 0, z: 0, width: 0.5, depth: 8 }],
    obstacles: [{ x: 5, z: 0, width: 1, depth: 2 }, { x: -5, z: 0, width: 2, depth: 3 }],
    collisionGrid: undefined,
  };
  const ghostWorld = ghostCollisionWorld(world);

  assert.equal(isPositionWalkable({ x: 0, z: 0 }, ghostWorld), false);
  assert.equal(isPositionWalkable({ x: 5, z: 0 }, ghostWorld), true);
  assert.equal(isPositionWalkable({ x: -5, z: 0 }, ghostWorld), true);
  assert.ok(movePlayer({ x: -2, z: 0 }, { x: 1, z: 0 }, 1, ghostWorld).x < 0);
  assert.ok(movePlayer({ x: 3.5, z: 0 }, { x: 1, z: 0 }, 0.8, ghostWorld).x > 6);
});

test("prop hint detection catches a blocked walking step and ignores a wall-only block", () => {
  const propWorld: WorldConfig = {
    ...CAMPUS_WORLD,
    width: 20,
    depth: 20,
    walls: [],
    obstacles: [{ x: 0, z: 0, width: 1, depth: 4 }],
    collisionGrid: undefined,
  };
  const start = { x: -2, z: 0 };
  const intent = { x: 1, z: 0 };
  const normalStep = movePlayer(start, intent, 0.5, propWorld);
  const ghostStep = movePlayer(start, intent, 0.5, ghostCollisionWorld(propWorld));
  assert.equal(movementBlockedByProps(normalStep, ghostStep), true);

  const wallWorld = { ...propWorld, obstacles: [], walls: [{ x: 0, z: 0, width: 1, depth: 4 }] };
  const wallStep = movePlayer(start, intent, 0.5, wallWorld);
  const ghostWallStep = movePlayer(start, intent, 0.5, ghostCollisionWorld(wallWorld));
  assert.equal(movementBlockedByProps(wallStep, ghostWallStep), false);
});

test("ghost collision keeps map walls and wall-model props solid while passing through furniture", () => {
  const world = campusWorldFromConfig({ version: 1, layout: {
    version: 1,
    props: [
      { id: "wall-model", asset: "kit-building-kit-wall", x: 0, z: 0, rotation: 0, collision: false, elevation: 1.5 },
      { id: "desk", asset: "desk", x: 5, z: 0, rotation: 0, collision: true },
    ],
    zones: [],
    walls: [{ id: "room-wall", axis: "horizontal", x: 0, z: 5, length: 8, thickness: 0.5, height: 3 }],
    doors: [],
  } });
  const ghostWorld = ghostCollisionWorld(world);

  assert.equal(isPositionWalkable({ x: 0, z: 0 }, ghostWorld), false);
  assert.equal(isPositionWalkable({ x: 0, z: 5 }, ghostWorld), false);
  assert.equal(isPositionWalkable({ x: 5, z: 0 }, ghostWorld), true);
});
