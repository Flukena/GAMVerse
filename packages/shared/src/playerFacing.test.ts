import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlayerFacing } from "./playerFacing.ts";

const AIM_YAW_RAD = Math.PI / 2;
const SEAT_YAW_RAD = -Math.PI / 2;
const IDLE_INPUT = { x: 0, z: 0 };
const FORWARD_INPUT = { x: 0, z: -1 };
const CURRENT_YAW_RAD = 0;
const ON_FOOT = { seated: false, inVehicle: false, currentRotation: CURRENT_YAW_RAD };

test("aim sets facing while stationary and while strafing without changing input", () => {
  for (const movement of [IDLE_INPUT, FORWARD_INPUT]) {
    const input = { ...movement, facingYaw: AIM_YAW_RAD };
    assert.equal(resolvePlayerFacing({ ...ON_FOOT, input }), AIM_YAW_RAD);
    assert.deepEqual(input, { ...movement, facingYaw: AIM_YAW_RAD });
  }
});

test("seated players keep seat orientation even with aim and movement", () => {
  assert.equal(resolvePlayerFacing({ ...ON_FOOT, seated: true, currentRotation: SEAT_YAW_RAD, input: { ...FORWARD_INPUT, facingYaw: AIM_YAW_RAD } }), SEAT_YAW_RAD);
});

test("aim overrides movement only when present, otherwise movement or idle facing applies", () => {
  assert.equal(resolvePlayerFacing({ ...ON_FOOT, input: { ...FORWARD_INPUT, facingYaw: AIM_YAW_RAD } }), AIM_YAW_RAD);
  assert.equal(resolvePlayerFacing({ ...ON_FOOT, input: FORWARD_INPUT }), Math.PI);
  assert.equal(resolvePlayerFacing({ ...ON_FOOT, currentRotation: AIM_YAW_RAD, input: IDLE_INPUT }), AIM_YAW_RAD);
});

test("vehicle travel direction takes priority over aim and idle vehicles keep facing", () => {
  assert.equal(resolvePlayerFacing({ ...ON_FOOT, input: { ...FORWARD_INPUT, facingYaw: AIM_YAW_RAD } }), AIM_YAW_RAD);
  assert.equal(resolvePlayerFacing({ ...ON_FOOT, inVehicle: true, input: { ...FORWARD_INPUT, facingYaw: AIM_YAW_RAD } }), Math.PI);
  assert.equal(resolvePlayerFacing({ ...ON_FOOT, inVehicle: true, input: { ...IDLE_INPUT, facingYaw: AIM_YAW_RAD } }), CURRENT_YAW_RAD);
});

test("finite large aim is bounded before assigning a float32 rotation", () => {
  const rotation = resolvePlayerFacing({ ...ON_FOOT, input: { ...IDLE_INPUT, facingYaw: Number.MAX_VALUE } });
  assert.ok(Number.isFinite(rotation) && rotation >= -Math.PI && rotation <= Math.PI);
});
