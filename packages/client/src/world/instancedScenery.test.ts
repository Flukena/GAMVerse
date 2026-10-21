import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createInstancedSceneryBatches, isInstancedScenery } from "./instancedScenery";
import { ROADSIDE_FRONT_M as R, RoadsideSceneryVisibility } from "./roadsideScenery";

for (const farId of ["campus-landscape-3", "campus-city-tree-south-1--1-58", "campus-civic-park-tree-1"]) {
  test(`chunked ${farId} retains instancing, source transforms, resources and far-prop culling`, () => {
    const template = new THREE.Group();
    const source = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
    source.position.set(1, 2, 3);
    template.add(source);
    const props = [
      { id: "campus-city-tree-north-1--1-58", x: 0, z: 0 },
      { id: "campus-city-tree-north-1-1-58", x: 10, z: 0 },
      { id: farId, x: 600, z: 0 },
    ].map(prop => ({ ...prop, asset: "tree", width: 2, depth: 2, rotation: Math.PI / 2, elevation: 5, collision: true }));
    const before = structuredClone(props);
    const roadside = new RoadsideSceneryVisibility(props);
    roadside.update({ x: 0, z: 0 }, "lobby", false);
    const batches = createInstancedSceneryBatches(template, props, { width: 1000, depth: 800 }, roadside);
    assert.equal(batches.length, 2);
    assert.deepEqual(batches.map(batch => batch.visible), [true, false]);
    assert.deepEqual(batches.map(batch => (batch.children[0] as THREE.InstancedMesh).count), [2, 0]);
    const instances = batches[0].children[0] as THREE.InstancedMesh;
    assert.equal(instances.geometry, source.geometry);
    assert.equal(instances.material, source.material);
    assert.equal(instances.castShadow, true);
    assert.equal(instances.receiveShadow, true);
    assert.equal(instances.userData.sharedRoomPropGeometry, true);
    assert.equal(instances.userData.sharedRoomPropMaterials, true);
    const actual = new THREE.Matrix4();
    instances.getMatrixAt(0, actual);
    const expected = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(500, 5, 400).multiply(source.matrixWorld);
    actual.elements.forEach((value, index) => assert.ok(Math.abs(value - expected.elements[index]) < 0.00001));
    assert.deepEqual(props, before);
    roadside.update({ x: 600, z: 0 }, "lobby", false);
    assert.deepEqual(batches.map(batch => batch.visible), [false, true]);
    assert.deepEqual(batches.map(batch => (batch.children[0] as THREE.InstancedMesh).count), [0, 1]);
    roadside.update({ x: 0, z: 0 }, "private-1", false);
    assert.ok(batches.every(batch => batch.visible));
    assert.deepEqual(batches.map(batch => (batch.children[0] as THREE.InstancedMesh).count), [2, 1]);
  });
}

test("instances outside the directional area are dropped individually inside a chunk that is partly in range", () => {
  const template = new THREE.Group();
  template.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  const props = [{ id: "near", x: 0, z: R - 10 }, { id: "far", x: 0, z: R + 40 }, { id: "beside", x: R - 10, z: 0 }]
    .map(prop => ({ ...prop, asset: "tree", width: 2, depth: 2, rotation: 0, collision: true }));
  const roadside = new RoadsideSceneryVisibility(props);
  roadside.update({ x: 0, z: 0, rotation: 0 }, "lobby", false);
  const [batch] = createInstancedSceneryBatches(template, props, { width: 1000, depth: 800 }, roadside);
  assert.equal((batch.children[0] as THREE.InstancedMesh).count, 1);
  const kept = new THREE.Matrix4();
  (batch.children[0] as THREE.InstancedMesh).getMatrixAt(0, kept);
  assert.equal(kept.elements[14], R - 10 + 400);
});

test("instancing eligibility still excludes interactive furniture and vehicles", () => {
  const catalog = { asset: "tree", label: "Tree" };
  assert.equal(isInstancedScenery(catalog), true);
  for (const excluded of [{ geometry: {} }, { interaction: "sit" }, { vehicleId: "car" }, { supportsPlacement: true }]) {
    assert.equal(isInstancedScenery({ ...catalog, ...excluded }), false);
  }
  assert.equal(isInstancedScenery({ asset: "desk", label: "Desk" }), false);
});