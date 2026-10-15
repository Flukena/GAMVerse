import * as THREE from "three";

/** Detect skinned meshes whose large local scale separates their mesh units from the armature. */
export function hasLargeSkinnedMeshScale(root: THREE.Object3D): boolean {
  let hasLargeScale = false;
  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    if (object.scale.toArray().some((axisScale) => Math.abs(axisScale) >= 10)) hasLargeScale = true;
  });
  return hasLargeScale;
}
