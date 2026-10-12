import assert from "node:assert/strict";
import test from "node:test";
import { arePlayersNearby, CAMPUS_LAYOUT, CAMPUS_WORLD, campusPropPlacements, campusWorldFromConfig, isPositionWalkable, isValidMovementInput, movePlayer, roomPropCollisionClearanceRadius, roomPropCollisionFootprint, roomWorldFromConfig, screenMovementToWorld, WORLD } from "./index.ts";

test("normalizes diagonal movement to the configured walk speed", () => {
  const result = movePlayer({ x: 0, z: 0 }, { x: 1, z: 1 }, 0.1);
  assert.ok(Math.abs(Math.hypot(result.x, result.z) - WORLD.movementSpeed * 0.1) < 1e-9);
});

test("clamps movement to the office boundary", () => {
  const result = movePlayer({ x: 11.5, z: 0 }, { x: 1, z: 0 }, 1);
  assert.equal(result.x, WORLD.width / 2 - WORLD.playerRadius);
});

test("cannot tunnel through the north wall during a long time step", () => {
  const result = movePlayer({ x: 0, z: -3.4 }, { x: 0, z: -1 }, 0.5);
  assert.ok(isPositionWalkable(result));
  assert.ok(result.z > -4.2);
});

test("slides along desk obstruction without entering it", () => {
  const start = { x: -6.6, z: -5.8 };
  assert.ok(isPositionWalkable(start));
  const result = movePlayer(start, { x: -1, z: 0.35 }, 0.5);
  assert.ok(isPositionWalkable(result));
  assert.ok(result.z > start.z);
});

test("accepts only finite bounded movement input", () => {
  assert.equal(isValidMovementInput({ x: 1, z: -1 }), true);
  assert.equal(isValidMovementInput({ x: 1.01, z: 0 }), false);
  assert.equal(isValidMovementInput({ x: Number.NaN, z: 0 }), false);
  assert.equal(isValidMovementInput(null), false);
});

test("accepts optional finite facing yaw and rejects invalid aim values", () => {
  const idleInput = { x: 0, z: 0 };
  for (const facingYaw of [undefined, 0, Math.PI, -Math.PI, Number.MAX_VALUE]) {
    assert.equal(isValidMovementInput({ ...idleInput, facingYaw }), true);
  }
  for (const facingYaw of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "0", null, false, {}]) {
    assert.equal(isValidMovementInput({ ...idleInput, facingYaw }), false);
  }
  assert.equal(isValidMovementInput({ ...idleInput, x: Number.NaN, facingYaw: Math.PI }), false);
});

test("uses the configured proximity radius inclusively", () => {
  assert.equal(arePlayersNearby({ x: 0, z: 0 }, { x: WORLD.proximityRadius, z: 0 }), true);
  assert.equal(arePlayersNearby({ x: 0, z: 0 }, { x: WORLD.proximityRadius + 0.01, z: 0 }), false);
});

test("converts forward and right movement relative to the camera yaw", () => {
  const forwardAtYawZero = screenMovementToWorld({ x: 0, z: 1 }, 0);
  assert.ok(Math.abs(forwardAtYawZero.x) < 1e-9);
  assert.ok(Math.abs(forwardAtYawZero.z + 1) < 1e-9);

  const forwardAtQuarterTurn = screenMovementToWorld({ x: 0, z: 1 }, Math.PI / 2);
  assert.ok(Math.abs(forwardAtQuarterTurn.x + 1) < 1e-9);
  assert.ok(Math.abs(forwardAtQuarterTurn.z) < 1e-9);
});

test("every placed Campus furniture prop has a matching collision footprint", () => {
  for (const room of CAMPUS_LAYOUT.rooms) {
    const expected = campusPropPlacements(room).filter((prop) => prop.collision);
    if (!expected.length) continue;
    for (const prop of expected) {
      const x = room.x - CAMPUS_LAYOUT.floors[0]!.width / 2 + prop.x;
      const z = room.z - CAMPUS_LAYOUT.floors[0]!.depth / 2 + prop.z;
      assert.ok(CAMPUS_WORLD.obstacles.some((blocker) =>
        Math.abs(blocker.x - x) < 1e-9 && Math.abs(blocker.z - z) < 1e-9 &&
        Math.abs(blocker.width - prop.collisionWidth) < 1e-9 && Math.abs(blocker.depth - prop.collisionDepth) < 1e-9
      ), `missing blocker for ${room.id}/${prop.asset}`);
    }
  }
});

test("empty campus layout does not create phantom furniture collision", () => {
  assert.equal(CAMPUS_LAYOUT.rooms.length, 0);
  assert.equal(CAMPUS_WORLD.obstacles.length, 0);
  assert.equal(isPositionWalkable({ x: 0, z: 0 }, CAMPUS_WORLD), true);
});

test("saved room prop layout drives server collision and supports non-blocking decor", () => {
  const world = roomWorldFromConfig({ layout: { version: 1, props: [
    { id: "desk-1", asset: "desk", x: 1, z: 2, rotation: 0, collision: true },
    { id: "screen-1", asset: "computerScreen", x: 1, z: 2, rotation: 0, collision: false },
  ], zones: [] } });
  assert.equal(world.obstacles.length, 1);
  assert.equal(isPositionWalkable({ x: 1, z: 2 }, world), false);
  assert.equal(isPositionWalkable({ x: 1, z: 3 }, world), true);
  const stopped = movePlayer({ x: 1, z: 3 }, { x: 0, z: -1 }, 0.5, world);
  assert.ok(stopped.z > 2.38);
  assert.equal(roomWorldFromConfig({ version: 1 }).obstacles, WORLD.obstacles);
});

test("saved office map props use campus coordinates for server collision", () => {
  const world = campusWorldFromConfig({ version: 1, layout: { version: 1, props: [
    { id: "desk-1", asset: "desk", x: 43, z: 53, rotation: 0, collision: true },
    { id: "screen-1", asset: "computerScreen", x: 43, z: 53, rotation: 0, collision: false },
  ], zones: [] } });
  assert.equal(world.obstacles.length, CAMPUS_WORLD.obstacles.length + 1);
  assert.equal(isPositionWalkable({ x: 43, z: 53 }, world), false);
  assert.equal(isPositionWalkable({ x: 43, z: 54 }, world), true);
  const stopped = movePlayer({ x: 43, z: 54 }, { x: 0, z: -1 }, 0.5, world);
  assert.ok(stopped.z > 53.38);
});

test("seat collision follows chair and sofa model footprints instead of the 1 m editor cells", () => {
  const chair = roomPropCollisionFootprint({ asset: "kit:chair", width: 1, depth: 1, rotation: 0 });
  assert.ok(Math.abs(chair.width - 0.383 * 0.9) < 1e-9);
  assert.ok(Math.abs(chair.depth - 0.383 * 0.9) < 1e-9);

  const sofa = roomPropCollisionFootprint({ asset: "kit:loungesofa", width: 1.917, depth: 1, rotation: 0 });
  assert.ok(Math.abs(sofa.width - 1.917 * 0.9) < 1e-9);
  assert.ok(Math.abs(sofa.depth - 0.802 * 0.9) < 1e-9);

  const rotatedChair = roomPropCollisionFootprint({ asset: "kit:chair", width: 1, depth: 1, rotation: Math.PI / 2 });
  assert.ok(Math.abs(rotatedChair.width - 0.383 * 0.9) < 1e-9);
  assert.ok(Math.abs(rotatedChair.depth - 0.383 * 0.9) < 1e-9);
  assert.equal(roomPropCollisionClearanceRadius({ asset: "kit:chair" }), 0.2);
  assert.equal(roomPropCollisionClearanceRadius({ asset: "desk" }), CAMPUS_WORLD.playerRadius);

  const world = roomWorldFromConfig({ layout: { version: 1, props: [
    { id: "chair", asset: "kit:chair", x: 0, z: 0, rotation: 0, collision: true },
    { id: "sofa", asset: "kit:loungesofa", x: 4, z: 0, rotation: 0, collision: true },
  ] } });
  assert.ok(Math.abs(world.obstacles.find((item) => item.x === 0)!.width - 0.383 * 0.9) < 1e-9);
  assert.ok(Math.abs(world.obstacles.find((item) => item.x === 4)!.width - 1.917 * 0.9) < 1e-9);
  assert.equal(world.obstacles.find((item) => item.x === 0)!.playerClearanceRadius, 0.2);
  assert.equal(isPositionWalkable({ x: 0.36, z: 0 }, world), false);
  assert.equal(isPositionWalkable({ x: 0.38, z: 0 }, world), true);
});
