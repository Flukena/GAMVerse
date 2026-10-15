import assert from "node:assert/strict";
import test from "node:test";
import { autoMoveDriveSpeed, autoMoveRouteLength, AUTO_MOVE_MAX_DRIVE_DURATION_SECONDS } from "./autoMoveTiming.js";

test("auto-move speed covers the planned route within the drive time budget", () => {
  const start = { x: 0, z: 0 };
  const points = [{ x: 150, z: 0 }, { x: 150, z: 50 }];
  const length = autoMoveRouteLength(start, points);
  const speed = autoMoveDriveSpeed(start, points, 21);

  assert.equal(length, 200);
  assert.ok(length / speed <= AUTO_MOVE_MAX_DRIVE_DURATION_SECONDS);
});

test("short auto-moves keep the normal vehicle speed", () => {
  assert.equal(autoMoveDriveSpeed({ x: 0, z: 0 }, [{ x: 5, z: 0 }], 21), 21);
});
