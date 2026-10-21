import assert from "node:assert/strict";
import test from "node:test";
import type { RoomLayout, RoomLayoutZone } from "@gammyverse/shared";
import { coveredZones, isCoveredPosition, zoneOccupantRows, ZoneVisibleLayout, zoneRoofHeightM, DEFAULT_ZONE_ROOF_HEIGHT_M, zoneRoofColor } from "./zoneVisibility";
const room: RoomLayoutZone = { id: "room", name: "Room", kind: "private", x: 0, z: 0, width: 10, depth: 10, color: "#fff" };
const restroom: RoomLayoutZone = { ...room, id: "wc", kind: "restroom", x: 20 };
test("outside zones have roofs, local zone including restroom stays open", () => {
  assert.deepEqual(coveredZones([room, restroom], { x: 0, z: 0 }), [restroom]);
  assert.deepEqual(coveredZones([room, restroom], { x: 20, z: 0 }), [room]);
  assert.deepEqual(coveredZones([room, restroom], { x: 40, z: 0 }), [room, restroom]);
});
test("boundaries and overlapping zones do not put roofs over the local player", () => {
  assert.deepEqual(coveredZones([room, { ...room, id: "inner", width: 2 }], { x: 1, z: 0 }), []);
  assert.deepEqual(coveredZones([room], { x: 5, z: 5 }), []);
});
test("editing opens all rooms and missing local presence covers all rooms", () => {
  assert.deepEqual(coveredZones([room], undefined), [room]);
  assert.deepEqual(coveredZones([room], undefined, true), []);
});
test("only props inside covered rooms are omitted; static layout is cached and restored", () => {
  const inside = { id: "inside", x: 0, z: 0 };
  const outside = { id: "outside", x: 15, z: 0 };
  const source = { version: 1, zones: [room], props: [inside, outside], walls: [], doors: [] } as unknown as RoomLayout;
  const cache = new ZoneVisibleLayout();
  const hidden = cache.update(source, coveredZones([room], { x: 15, z: 0 }));
  assert.deepEqual(hidden?.props, [outside]);
  assert.equal(cache.update(source, [room]), hidden);
  assert.equal(cache.update(source, []), source);
  assert.deepEqual(source.props, [inside, outside]);
});
test("occupant names follow current position, preserve Unicode, and fall back to username", () => {
  assert.deepEqual(zoneOccupantRows(room, [
    { x: 0, z: 0, displayName: " คุณเอ ", username: "a" },
    { x: 5, z: 0, displayName: "", username: "b" },
    { x: 6, z: 0, displayName: "Elsewhere", username: "c" },
  ]).map(row => row.name), ["คุณเอ", "b"]);
});
test("position culling applies only to covered room interiors", () => {
  assert.equal(isCoveredPosition({ x: 0, z: 0 }, [room]), true);
  assert.equal(isCoveredPosition({ x: 6, z: 0 }, [room]), false);
});

test("roofs meet the actual room wall height with a default for zones without walls", () => {
  assert.equal(zoneRoofHeightM(room, []), DEFAULT_ZONE_ROOF_HEIGHT_M);
  assert.equal(zoneRoofHeightM(room, [
    { id: "wall", axis: "horizontal", x: 0, z: 5, length: 10, thickness: 0.2, height: 4, color: "#fff" },
    { id: "elsewhere", axis: "horizontal", x: 20, z: 0, length: 10, thickness: 0.2, height: 8, color: "#fff" },
  ]), 4);
});

test("roof color matches a room wall and defaults to the existing wall color", () => {
  assert.equal(zoneRoofColor(room, []), "#63bbd0");
  assert.equal(zoneRoofColor(room, [
    { id: "elsewhere", axis: "horizontal", x: 20, z: 0, length: 10, thickness: 0.2, height: 4, color: "#123456" },
    { id: "room-wall", axis: "horizontal", x: 0, z: 5, length: 10, thickness: 0.2, height: 4, color: "#abcdef" },
  ]), "#abcdef");
});

test("occupant rows use existing presence colors and reflect status-only changes", () => {
  const occupant = { x: 0, z: 0, displayName: "Alice", username: "a", status: "available" };
  assert.deepEqual(zoneOccupantRows(room, [occupant]), [{ name: "Alice", color: "#2f9e62", statusLabel: "Available" }]);
  occupant.status = "do-not-disturb";
  assert.deepEqual(zoneOccupantRows(room, [occupant]), [{ name: "Alice", color: "#dc3545", statusLabel: "Busy (Do not disturb)" }]);
  occupant.status = "unknown";
  assert.equal(zoneOccupantRows(room, [occupant])[0].color, "#2f9e62");
});
