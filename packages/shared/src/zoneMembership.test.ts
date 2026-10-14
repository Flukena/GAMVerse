import assert from "node:assert/strict";
import test from "node:test";
import { roomLayoutZoneAt } from "./index.ts";
import type { RoomLayoutZone } from "./roomLayout.ts";

// Fixture dimensions/positions deliberately straddle the planned 0.5 m margin.
const ZONE_WIDTH_M = 8;
const EDGE_M = ZONE_WIDTH_M / 2;
const INSIDE_MARGIN_M = 0.25;
const OUTSIDE_MARGIN_M = 0.6;
const CORNER_OUTSIDE_MARGIN_M = 0.4;
const zone: RoomLayoutZone = { id: "A", name: "A", kind: "private", x: 0, z: 0, width: ZONE_WIDTH_M, depth: ZONE_WIDTH_M, color: "#ffffff" };
const config = (zones = [zone]) => ({ layout: { zones } });
const at = (x: number, z: number, previous?: string, zones?: RoomLayoutZone[]) => roomLayoutZoneAt({ x, z }, config(zones), previous);
test("entering requires being fully inside; previous membership retains the exit margin", () => {
  assert.equal(at(EDGE_M + INSIDE_MARGIN_M, 0), null);
  assert.equal(at(EDGE_M, 0)?.id, zone.id);
  assert.equal(at(EDGE_M + INSIDE_MARGIN_M, 0, zone.id)?.id, zone.id);
  assert.equal(at(EDGE_M + OUTSIDE_MARGIN_M, 0, zone.id), null);
});
test("corners use distance to the rectangle, not an expanded square", () => {
  assert.equal(at(EDGE_M + INSIDE_MARGIN_M, EDGE_M + INSIDE_MARGIN_M, zone.id)?.id, zone.id);
  assert.equal(at(EDGE_M + OUTSIDE_MARGIN_M, EDGE_M, zone.id), null);
  assert.equal(at(EDGE_M + CORNER_OUTSIDE_MARGIN_M, EDGE_M + CORNER_OUTSIDE_MARGIN_M, zone.id), null);
});
test("smaller nested zones win only when fully inside", () => {
  const nested = { ...zone, id: "nested", width: EDGE_M, depth: EDGE_M };
  assert.equal(at(0, 0, zone.id, [zone, nested])?.id, nested.id);
  assert.equal(at(EDGE_M / 2 + INSIDE_MARGIN_M, 0, zone.id, [zone, nested])?.id, zone.id);
});
test("adjacent equal-sized zones retain the previous until beyond its margin", () => {
  const adjacent = { ...zone, id: "B", x: ZONE_WIDTH_M };
  assert.equal(at(EDGE_M + INSIDE_MARGIN_M, 0, zone.id, [zone, adjacent])?.id, zone.id);
  assert.equal(at(EDGE_M + OUTSIDE_MARGIN_M, 0, zone.id, [zone, adjacent])?.id, adjacent.id);
});
test("removed and restroom zones cannot be retained", () => {
  assert.equal(at(0, 0, zone.id, []), null);
  assert.equal(at(0, 0, zone.id, [{ ...zone, kind: "restroom" }]), null);
});
test("a locked destination is never granted by the margin; raw movement lookup still detects entry", () => {
  const locked = { ...zone, id: "locked", x: ZONE_WIDTH_M };
  assert.equal(at(EDGE_M - INSIDE_MARGIN_M, 0, undefined, [locked]), null);
  assert.equal(at(EDGE_M + INSIDE_MARGIN_M, 0, undefined, [zone, locked])?.id, locked.id);
  assert.equal(at(EDGE_M + INSIDE_MARGIN_M, 0, zone.id, [zone, locked])?.id, zone.id);
});
