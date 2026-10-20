import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Group, Mesh, Raycaster, Vector3 } from "three";
import { OfficeMapSceneLayers } from "./officeMapSceneLayers";

function makeProp(id: string) {
  const root = new Group();
  root.userData.officeMapPropId = id;
  root.add(new Mesh(new BoxGeometry()));
  return root;
}

test("hidden editor picking subtrees remain raycastable without entering visible traversal", () => {
  const parent = new Group();
  const layers = new OfficeMapSceneLayers(parent);
  const target = makeProp("desk");
  layers.pickTargets.add(target);
  parent.updateMatrixWorld(true);
  const visible: string[] = [];
  parent.traverseVisible((object) => { if (object.userData.officeMapPropId) visible.push(object.userData.officeMapPropId); });
  assert.deepEqual(visible, []);
  const ray = new Raycaster(new Vector3(0, 0, 3), new Vector3(0, 0, -1));
  assert.equal(ray.intersectObjects(parent.children, true)[0].object.parent, target);
  layers.setEditing(true);
  assert.equal(layers.pickTargets.visible, false);
  assert.equal(layers.collisionOverlays.visible, true);
  assert.equal(layers.selections.visible, true);
  layers.setEditing(false);
  assert.equal(layers.collisionOverlays.visible, false);
  assert.equal(layers.selections.visible, false);
});

test("editor moves update models, support targets, highlights and collision layers together", () => {
  const parent = new Group();
  const layers = new OfficeMapSceneLayers(parent);
  const model = makeProp("desk");
  const support = makeProp("desk");
  const collision = makeProp("desk");
  const selection = makeProp("desk");
  const neighbor = makeProp("neighbor");
  model.updateMatrix();
  model.matrixAutoUpdate = false;
  parent.add(model, neighbor);
  layers.pickTargets.add(support);
  layers.collisionOverlays.add(collision);
  layers.selections.add(selection);
  parent.updateMatrixWorld(true);
  layers.moveProp(parent, "desk", { x: 4, y: 2, z: 3 });
  parent.updateMatrixWorld(true);
  for (const root of [model, support, collision, selection]) {
    assert.deepEqual(new Vector3().setFromMatrixPosition(root.children[0].matrixWorld).toArray(), [4, 2, 3]);
  }
  assert.deepEqual(neighbor.position.toArray(), [0, 0, 0]);
});

test("vehicle handle synchronization invalidates cached editor layer world matrices", () => {
  const parent = new Group();
  const layers = new OfficeMapSceneLayers(parent);
  const handles = [makeProp("vehicle"), makeProp("vehicle"), makeProp("vehicle")];
  layers.pickTargets.add(handles[0]);
  layers.selections.add(handles[1]);
  layers.collisionOverlays.add(handles[2]);
  parent.updateMatrixWorld(true);
  layers.syncVehicleHandles(handles, { x: 5, z: 8 });
  parent.updateMatrixWorld(true);
  for (const root of handles) {
    assert.equal(new Vector3().setFromMatrixPosition(root.children[0].matrixWorld).x, 5);
    assert.equal(new Vector3().setFromMatrixPosition(root.children[0].matrixWorld).z, 8);
  }
});
