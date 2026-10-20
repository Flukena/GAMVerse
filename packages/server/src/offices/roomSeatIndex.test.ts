import assert from "node:assert/strict";
import test from "node:test";
import { ROOM_PROP_CATALOG, roomPropSeatReference, type RoomLayoutProp } from "@gammyverse/shared";
import { RoomSeatIndex } from "./roomSeatIndex.js";

const SEAT_DEFINITION = ROOM_PROP_CATALOG.find(item => item.interaction === "sit")!;
const seatProp = (id: string, x = 0, z = 0): RoomLayoutProp => ({ id, asset: SEAT_DEFINITION.asset, x, z, width: 1, depth: 1, rotation: 0, collision: false });

test("seat metadata preserves ties, occupied places and rotated deep benches", () => {
  const first = seatProp("first"), second = seatProp("second");
  const index = new RoomSeatIndex([first, second]);
  assert.equal(index.nearest({ x: 0, z: 0 }, 3, new Set())?.seatId, roomPropSeatReference(first.id, 0));
  assert.equal(index.nearest({ x: 0, z: 0 }, 3, new Set([roomPropSeatReference(first.id, 0)]))?.seatId, roomPropSeatReference(second.id, 0));
  const bench = { ...seatProp("bench", 16, 16), width: 1, depth: 4, rotation: Math.PI / 2 };
  const rotated = new RoomSeatIndex([bench]);
  assert.equal(rotated.nearest({ x: 17.5, z: 16 }, 0, new Set())?.seatIndex, 0);
  assert.equal(rotated.nearest({ x: 14.5, z: 16 }, 0, new Set())?.seatIndex, 3);
  assert.equal(rotated.nearest({ x: -100, z: -100 }, 3, new Set()), undefined);
});
