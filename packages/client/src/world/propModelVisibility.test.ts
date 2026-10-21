import assert from "node:assert/strict";
import test from "node:test";
import { Object3D } from "three";
import type { RoomLayoutZone } from "@gammyverse/shared";
import { PropModelVisibility, type DeferredPropModel } from "./propModelVisibility";
import { RoadsideSceneryVisibility } from "./roadsideScenery";
const room: RoomLayoutZone = { id: "room", name: "Room", kind: "meeting", x: 0, z: 0, width: 10, depth: 10, color: "#fff" };
function pending(id: string, x: number): DeferredPropModel {
  return { propId: id, position: { x, z: 100 }, started: false, start() { this.started = true; } };
}
test("covered room props neither load nor render and open immediately on entry", () => {
  const controller = new PropModelVisibility();
  const indoors = pending("in", 100);
  const outdoors = pending("out", 110);
  const visual = new Object3D();
  visual.position.set(100, 0, 100);
  const roadside = new RoadsideSceneryVisibility([]);
  const offset = { x: 100, z: 100 };
  controller.update(0, false, undefined, "lobby", offset, roadside, [indoors, outdoors], [visual], [room], offset);
  assert.equal(indoors.started, false);
  assert.equal(outdoors.started, true);
  assert.equal(visual.visible, false);
  controller.update(1, false, undefined, "lobby", offset, roadside, [indoors], [visual], [], offset);
  assert.equal(indoors.started, true);
  assert.equal(visual.visible, true);
});
test("editing preserves loading and visibility for props outside normal distance", () => {
  const controller = new PropModelVisibility();
  const prop = pending("far", 1000);
  const visual = new Object3D();
  visual.position.set(1000, 0, 1000);
  visual.visible = false;
  controller.update(0, true, undefined, "lobby", { x: 0, z: 0 }, new RoadsideSceneryVisibility([]), [prop], [visual], [], { x: 0, z: 0 });
  assert.equal(prop.started, true);
  assert.equal(visual.visible, true);
});
