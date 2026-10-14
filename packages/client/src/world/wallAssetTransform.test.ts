import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { fitWallAssetModel } from "./wallAssetTransform";

function makeOffCenterCorner() {
  const corner = new THREE.Group();
  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.2));
  horizontal.position.set(0.45, 1, -0.4);
  const returnWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 1.6));
  returnWall.position.set(-0.45, 1, 0.3);
  corner.add(horizontal, returnWall);
  return corner;
}

test("wall asset fit keeps asymmetric corner geometry centered and floor-aligned", () => {
  const model = makeOffCenterCorner();
  const bounds = fitWallAssetModel(model, { height: 2.4, length: 4, wallAxis: "x", wallOrientation: "horizontal" });
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(center.x) < 1e-6);
  assert.ok(Math.abs(center.z) < 1e-6);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
  assert.ok(Math.abs(size.x - 4) < 1e-6);
  assert.ok(Math.abs(size.y - 2.4) < 1e-6);
});
test("wall asset fit rotates vertical segments and centers them", () => {
  const model = makeOffCenterCorner();
  const bounds = fitWallAssetModel(model, { height: 2.4, length: 3, wallAxis: "x", wallOrientation: "vertical" });
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(center.x) < 1e-6);
  assert.ok(Math.abs(center.z) < 1e-6);
  assert.ok(Math.abs(bounds.min.y) < 1e-6);
  assert.ok(Math.abs(size.z - 3) < 1e-6);
  assert.ok(Math.abs(size.y - 2.4) < 1e-6);
});
