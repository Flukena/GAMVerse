import * as THREE from "three";

export type WallAssetTransformOptions = {
  height: number;
  length: number;
  wallAxis: "x" | "z";
  wallOrientation: "horizontal" | "vertical";
};

/** Fit a wall model to a wall segment, then align its rendered bounds to the segment center and floor. */
export function fitWallAssetModel(model: THREE.Object3D, options: WallAssetTransformOptions) {
  const sourceBounds = new THREE.Box3().setFromObject(model);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(sourceSize.y) || sourceSize.y <= 0.001) {
    throw new Error("Wall asset has invalid source dimensions.");
  }

  const heightScale = options.height / sourceSize.y;
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  model.scale.setScalar(heightScale);
  model.position.set(
    -sourceCenter.x * heightScale,
    -sourceBounds.min.y * heightScale,
    -sourceCenter.z * heightScale,
  );

  const normalizedBounds = new THREE.Box3().setFromObject(model);
  const normalizedSize = normalizedBounds.getSize(new THREE.Vector3());
  model.scale[options.wallAxis] *= options.length / Math.max(normalizedSize[options.wallAxis], 0.01);
  model.rotation.y = options.wallOrientation === "horizontal"
    ? (options.wallAxis === "x" ? 0 : Math.PI / 2)
    : (options.wallAxis === "x" ? Math.PI / 2 : 0);

  // Axis scaling after normalization can move asymmetric or corner-shaped
  // models away from their anchor. Recenter after every transform, not before.
  model.updateMatrixWorld(true);
  const fittedBounds = new THREE.Box3().setFromObject(model);
  const fittedCenter = fittedBounds.getCenter(new THREE.Vector3());
  model.position.x -= fittedCenter.x;
  model.position.y -= fittedBounds.min.y;
  model.position.z -= fittedCenter.z;
  model.updateMatrixWorld(true);

  return new THREE.Box3().setFromObject(model);
}
