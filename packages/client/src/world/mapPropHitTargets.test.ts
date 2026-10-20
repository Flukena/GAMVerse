import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Group, PlaneGeometry, Raycaster, Vector3 } from "three";
import { createMapPropHitTarget } from "./mapPropHitTargets";

for (const kind of ["support", "drag"] as const) {
  test(`${kind} targets stay raycastable without entering visible traversal`, () => {
    const geometry = kind === "support" ? new PlaneGeometry(2, 2) : new BoxGeometry(2, 2, 2);
    const target = createMapPropHitTarget(geometry, "prop-1", kind);
    const parent = new Group();
    parent.position.set(10, 0, 5);
    parent.add(target);
    parent.updateMatrixWorld(true);
    try {
      const visible: unknown[] = [];
      parent.traverseVisible(object => visible.push(object));
      assert.equal(visible.includes(target), false);
      assert.equal(target.userData.officeMapPropId, "prop-1");
      assert.equal(target.userData[kind === "support" ? "mapPropSupportSurface" : "mapPropDragHitTarget"], true);
      const ray = new Raycaster(new Vector3(10, 0, 10), new Vector3(0, 0, -1));
      assert.equal(ray.intersectObjects(parent.children, true)[0]?.object, target);
      parent.position.x += 4;
      parent.updateMatrixWorld(true);
      assert.equal(ray.intersectObjects(parent.children, true).length, 0);
      ray.ray.origin.x += 4;
      assert.equal(ray.intersectObjects(parent.children, true)[0]?.object, target);
      if (kind === "support") {
        ray.ray.origin.z = 0;
        ray.ray.direction.z = 1;
        assert.equal(ray.intersectObjects(parent.children, true)[0]?.object, target);
      }
    } finally {
      geometry.dispose();
      target.material.dispose();
    }
  });
}
