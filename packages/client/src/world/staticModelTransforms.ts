import { type Object3D } from "three";

/** Cache one local transform; explicit editor changes must call updateMatrix(). */
export function cacheLocalMatrix(object: Object3D): void {
  if (!object.matrixAutoUpdate) return;
  object.updateMatrix();
  object.matrixAutoUpdate = false;
}

/** Use only for fitted, non-animated model contents, not their movable parent pivot. */
export function cacheStaticModelLocalMatrices(model: Object3D): void {
  model.traverse(cacheLocalMatrix);
}
