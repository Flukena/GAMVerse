import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector3 } from "three";
import { cacheLocalMatrix, cacheStaticModelLocalMatrices } from "./staticModelTransforms";
import { StaticSceneGroup } from "./staticSceneGroup";
import { OfficeMapSceneLayers } from "./officeMapSceneLayers";

test("cached model matrices preserve transformed geometry under moving parent pivots", () => {
  const model = new Group();
  model.position.set(1, 2, 3);
  model.rotation.y = 0.4;
  model.scale.set(2, 3, 4);
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  mesh.position.set(2, 0, -1);
  model.add(mesh);
  const pivot = new Group();
  pivot.add(model);
  const reference = pivot.clone(true);
  let compositions = 0;
  const update = mesh.updateMatrix.bind(mesh);
  mesh.updateMatrix = () => { compositions++; update(); };
  try {
    cacheStaticModelLocalMatrices(model);
    assert.equal(compositions, 1);
    assert.equal(pivot.matrixAutoUpdate, true);
    for (let step = 0; step < 4; step++) {
      for (const root of [pivot, reference]) {
        root.position.set(step * 5, step, -step);
        root.rotation.y = step * 0.7;
        root.scale.setScalar(1 + step * 0.2);
        root.updateMatrixWorld(true);
      }
      const expected = reference.children[0]!.children[0]!;
      assert.equal(mesh.matrixWorld.equals(expected.matrixWorld), true);
      const center = mesh.getWorldPosition(new Vector3());
      const ray = new Raycaster(center.clone().add(new Vector3(0, 20, 0)), new Vector3(0, -1, 0));
      assert.equal(ray.intersectObject(pivot, true)[0]?.object, mesh);
    }
    assert.equal(compositions, 1, "static local matrices must not be recomposed each frame");
  } finally {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

test("authored manual matrices are retained without recomposing from TRS", () => {
  const model = new Group();
  model.matrixAutoUpdate = false;
  model.matrix.set(1, 0.5, 0, 2, 0, 1, 0, 3, 0, 0, 1, 4, 0, 0, 0, 1);
  const before = new Matrix4().copy(model.matrix);
  cacheStaticModelLocalMatrices(model);
  assert.deepEqual(model.matrix.elements, before.elements);
});

test("static ancestors avoid repeated world multiplication and editor moves invalidate cached roots", () => {
  const scene = new Scene();
  const campus = new Group();
  const props = new Group();
  const pivot = new StaticSceneGroup();
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  mesh.position.set(1, 0, 0);
  pivot.position.set(5, 0, 2);
  pivot.userData.officeMapPropId = "desk";
  pivot.add(mesh);
  props.add(pivot);
  campus.add(props);
  scene.add(campus);
  const dynamic = new Group();
  scene.add(dynamic);
  const unrelated = new Group();
  unrelated.userData.officeMapPropId = "other";
  props.add(unrelated);
  for (const root of [scene, campus, props, pivot]) cacheLocalMatrix(root);
  cacheStaticModelLocalMatrices(mesh);
  const reference = scene.clone(true);
  reference.traverse(object => { object.matrixAutoUpdate = true; });
  const layers = new OfficeMapSceneLayers(props);
  const referenceProps = reference.children[0]!.children[0]!;
  assert.ok(referenceProps instanceof Group);
  const referenceLayers = new OfficeMapSceneLayers(referenceProps);
  let multiplications = 0;
  let visits = 0;
  const updateWorld = mesh.updateMatrixWorld.bind(mesh);
  mesh.updateMatrixWorld = force => { visits++; updateWorld(force); };
  const multiply = mesh.matrixWorld.multiplyMatrices.bind(mesh.matrixWorld);
  mesh.matrixWorld.multiplyMatrices = (a, b) => { multiplications++; return multiply(a, b); };
  try {
    scene.updateMatrixWorld();
    assert.equal(multiplications, 1);
    for (let frame = 0; frame < 10; frame++) {
      dynamic.position.x = frame;
      scene.updateMatrixWorld();
      assert.equal(dynamic.matrixWorld.elements[12], frame);
    }
    assert.equal(multiplications, 1, "unchanged descendants must not multiply world matrices each frame");
    assert.equal(visits, 1, "unchanged static subtrees must not traverse their descendants");
    for (const [dx, dy, dz] of [[2, 0, -3], [0, 1.5, 0], [-1, -0.5, 2]]) {
      layers.moveProp(props, "desk", { x: dx!, y: dy!, z: dz! });
      referenceLayers.moveProp(referenceProps, "desk", { x: dx!, y: dy!, z: dz! });
      scene.updateMatrixWorld();
      reference.updateMatrixWorld();
      const expected = reference.children[0]!.children[0]!.children[0]!.children[0]!;
      assert.equal(mesh.matrixWorld.equals(expected.matrixWorld), true);
      const position = mesh.getWorldPosition(new Vector3());
      const ray = new Raycaster(position.clone().add(new Vector3(0, 10, 0)), new Vector3(0, -1, 0));
      assert.equal(ray.intersectObject(props, true)[0]?.object, mesh);
      assert.equal(unrelated.position.length(), 0);
    }
    // Newly loaded descendants must still initialize under already-clean ancestors.
    const loaded = new Group();
    loaded.position.set(9, 2, 3);
    cacheLocalMatrix(loaded);
    props.add(loaded);
    scene.updateMatrixWorld();
    assert.deepEqual(loaded.getWorldPosition(new Vector3()).toArray(), [9, 2, 3]);
    campus.position.set(2, 0, 4);
    campus.updateMatrix();
    scene.updateMatrixWorld();
    assert.deepEqual(loaded.getWorldPosition(new Vector3()).toArray(), [11, 2, 7]);
  } finally {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

test("static subtree refreshes after external world-position queries, forced passes and cloning", () => {
  const parent = new Group();
  const root = new StaticSceneGroup();
  const child = new Group();
  child.position.set(2, 1, 3);
  root.add(child);
  parent.add(root);
  cacheStaticModelLocalMatrices(root);
  cacheLocalMatrix(parent);
  parent.updateMatrixWorld();
  root.position.set(7, 2, 1);
  root.updateMatrix();
  root.getWorldPosition(new Vector3());
  parent.updateMatrixWorld();
  assert.deepEqual(child.matrixWorld.elements.slice(12, 15), [9, 3, 4]);
  parent.position.set(4, 0, 0);
  parent.updateMatrix();
  parent.updateMatrixWorld();
  assert.deepEqual(child.matrixWorld.elements.slice(12, 15), [13, 3, 4]);
  child.position.y = 6;
  child.updateMatrix();
  root.invalidate();
  parent.updateMatrixWorld(true);
  assert.equal(child.matrixWorld.elements[13], 8);
  const clone = root.clone(true);
  const preview = new Group();
  preview.position.x = -10;
  preview.add(clone);
  preview.updateMatrixWorld();
  assert.deepEqual(clone.children[0]!.matrixWorld.elements.slice(12, 15), [-1, 8, 4]);
});
