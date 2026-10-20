import assert from "node:assert/strict";
import test from "node:test";
import { Group, Mesh, BoxGeometry, Scene, Vector3 } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { StaticSceneGroup } from "./staticSceneGroup";

const POSITION_EPSILON_M = 1e-9;

function measuredMesh() {
  const mesh = new Mesh(new BoxGeometry());
  const update = mesh.updateMatrixWorld.bind(mesh);
  let visits = 0;
  mesh.updateMatrixWorld = (force) => { visits += 1; update(force); };
  return { mesh, visits: () => visits };
}

test("an unchanged static subtree avoids descendant visits despite forced scene updates", () => {
  const scene = new Scene();
  const root = new StaticSceneGroup();
  const measured = measuredMesh();
  root.position.set(2, 3, 4);
  measured.mesh.position.set(5, 6, 7);
  root.add(measured.mesh);
  scene.add(root);
  scene.updateMatrixWorld(true);
  assert.deepEqual(measured.mesh.getWorldPosition(new Vector3()).toArray(), [7, 9, 11]);
  const initialVisits = measured.visits();
  scene.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  assert.equal(measured.visits(), initialVisits);
});

test("parent and root motion update descendant world transforms even after a world query", () => {
  const scene = new Scene();
  const parent = new Group();
  const root = new StaticSceneGroup();
  const mesh = new Mesh(new BoxGeometry());
  mesh.position.set(1, 0, 0);
  root.add(mesh);
  parent.add(root);
  scene.add(parent);
  scene.updateMatrixWorld(true);
  parent.position.set(4, 2, 0);
  parent.rotation.y = Math.PI / 2;
  root.position.z = 3;
  root.getWorldPosition(new Vector3());
  scene.updateMatrixWorld(true);
  const actual = new Vector3().setFromMatrixPosition(mesh.matrixWorld);
  assert.ok(Math.abs(actual.x - 7) < POSITION_EPSILON_M);
  assert.ok(Math.abs(actual.y - 2) < POSITION_EPSILON_M);
  assert.ok(Math.abs(actual.z + 1) < POSITION_EPSILON_M);
});

test("late-loaded direct content and explicitly invalidated nested content are placed correctly", () => {
  const root = new StaticSceneGroup();
  root.position.x = 10;
  root.updateMatrixWorld(true);
  const loaded = new Group();
  loaded.position.x = 2;
  root.add(loaded);
  root.updateMatrixWorld(true);
  const nested = new Mesh(new BoxGeometry());
  nested.position.x = 3;
  loaded.add(nested);
  root.invalidate();
  root.updateMatrixWorld(true);
  assert.equal(new Vector3().setFromMatrixPosition(nested.matrixWorld).x, 15);
  nested.position.x = 4;
  root.invalidate();
  root.updateMatrixWorld(true);
  assert.equal(new Vector3().setFromMatrixPosition(nested.matrixWorld).x, 16);
});

test("hidden static content re-enters with current transforms and untouched shadow flags", () => {
  const root = new StaticSceneGroup();
  const mesh = new Mesh(new BoxGeometry());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  root.updateMatrixWorld(true);
  root.visible = false;
  root.position.x = 9;
  root.updateMatrixWorld(true);
  root.visible = true;
  root.updateMatrixWorld(true);
  assert.equal(new Vector3().setFromMatrixPosition(mesh.matrixWorld).x, 9);
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
});

test("ordinary animated siblings and cloned editor previews remain live", () => {
  const scene = new Scene();
  const root = new StaticSceneGroup();
  const model = new Group();
  model.add(new Mesh(new BoxGeometry()));
  root.add(model);
  scene.add(root);
  scene.updateMatrixWorld(true);
  const door = new Group();
  const vehicle = new Group();
  scene.add(door, vehicle);
  const preview = clone(root);
  scene.add(preview);
  scene.updateMatrixWorld(true);
  door.position.x = 2;
  vehicle.position.z = 3;
  preview.position.y = 4;
  scene.updateMatrixWorld(true);
  assert.equal(new Vector3().setFromMatrixPosition(door.matrixWorld).x, 2);
  assert.equal(new Vector3().setFromMatrixPosition(vehicle.matrixWorld).z, 3);
  assert.equal(new Vector3().setFromMatrixPosition(preview.children[0].children[0].matrixWorld).y, 4);
  assert.equal(preview.children[0].matrixAutoUpdate, true);
});
