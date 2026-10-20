import { Box3, MathUtils, Matrix4, Mesh, Ray, Vector3, type Material, type Object3D } from "three";
import type { CameraPose } from "./cameraPose";
import type { CameraMode } from "./cameraState";

const OCCLUDED_OPACITY_RATIO = 0.15;
const FADE_TIME_SEC = 0.12;
const OPACITY_SNAP_TOLERANCE_RATIO = 0.001;
const SIGHTLINE_PADDING_M = 0.2;
const FULL_OPACITY_RATIO = 1;

type MaterialBinding = { original: Material; faded: Material };
type MeshBinding = { mesh: Mesh; original: Material | Material[]; materials: MaterialBinding[]; castShadow: boolean };

function bindMesh(mesh: Mesh): MeshBinding {
  const original = mesh.material;
  const materials = (Array.isArray(original) ? original : [original]).map((material) => ({ original: material, faded: material.clone() }));
  mesh.material = Array.isArray(original) ? materials.map(({ faded }) => faded) : materials[0]!.faded;
  return { mesh, original, materials, castShadow: mesh.castShadow };
}

function applyOpacity(binding: MeshBinding, opacityRatio: number): void {
  const fading = opacityRatio < FULL_OPACITY_RATIO;
  const castShadow = fading ? false : binding.castShadow;
  if (binding.mesh.castShadow !== castShadow) binding.mesh.castShadow = castShadow;
  for (const { original, faded } of binding.materials) {
    const transparent = fading || original.transparent;
    if (faded.transparent !== transparent) {
      faded.transparent = transparent;
      faded.needsUpdate = true;
    }
    const opacity = original.opacity * opacityRatio;
    const depthWrite = fading ? false : original.depthWrite;
    if (faded.opacity !== opacity) faded.opacity = opacity;
    if (faded.depthWrite !== depthWrite) faded.depthWrite = depthWrite;
  }
}

function isWorldVisible(root: Object3D): boolean {
  for (let node: Object3D | null = root; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

class FadingOccluder {
  private readonly bindings: MeshBinding[] = [];
  private readonly bounds = new Box3();
  private readonly worldMatrix = new Matrix4();
  private readonly hitPoint = new Vector3();
  private opacityRatio = FULL_OPACITY_RATIO;

  constructor(private readonly root: Object3D) {
    root.traverse((object) => { if (object instanceof Mesh) this.bindings.push(bindMesh(object)); });
    this.updateBounds();
  }

  private updateBounds(): void {
    this.root.updateWorldMatrix(true, true);
    this.bounds.setFromObject(this.root).expandByScalar(SIGHTLINE_PADDING_M);
    this.worldMatrix.copy(this.root.matrixWorld);
  }

  intersects(ray: Ray, distanceM: number): boolean {
    if (!isWorldVisible(this.root)) return false;
    this.root.updateWorldMatrix(true, false);
    if (!this.worldMatrix.equals(this.root.matrixWorld)) this.updateBounds();
    if (this.bounds.containsPoint(ray.origin)) return true;
    const hit = ray.intersectBox(this.bounds, this.hitPoint);
    return hit !== null && hit.distanceTo(ray.origin) <= distanceM;
  }

  update(blocked: boolean, blend: number): void {
    const targetRatio = blocked ? OCCLUDED_OPACITY_RATIO : FULL_OPACITY_RATIO;
    if (this.opacityRatio !== targetRatio) {
      this.opacityRatio = MathUtils.lerp(this.opacityRatio, targetRatio, blend);
      if (Math.abs(this.opacityRatio - targetRatio) < OPACITY_SNAP_TOLERANCE_RATIO) this.opacityRatio = targetRatio;
    }
    for (const binding of this.bindings) applyOpacity(binding, this.opacityRatio);
  }

  dispose(): void {
    for (const binding of this.bindings) {
      binding.mesh.material = binding.original;
      binding.mesh.castShadow = binding.castShadow;
      for (const { faded } of binding.materials) faded.dispose();
    }
  }
}

/** Fades registered walls/doors/props without moving the camera or changing its lens. */
export class CameraOcclusion {
  private readonly occluders: FadingOccluder[] = [];
  private readonly ray = new Ray();
  private readonly direction = new Vector3();

  register(root: Object3D): void {
    this.occluders.push(new FadingOccluder(root));
  }

  apply(pose: CameraPose, mode: CameraMode, deltaSec: number, snap: boolean): CameraPose {
    this.direction.copy(pose.position).sub(pose.lookAt);
    const distanceM = this.direction.length();
    this.ray.set(pose.lookAt, this.direction.normalize());
    const active = mode === "tpp" && distanceM > 0;
    const blend = snap || !active ? FULL_OPACITY_RATIO : -Math.expm1(-Math.max(0, deltaSec) / FADE_TIME_SEC);
    for (const occluder of this.occluders) {
      occluder.update(active && occluder.intersects(this.ray, distanceM), blend);
    }
    return pose;
  }

  dispose(): void {
    for (const occluder of this.occluders) occluder.dispose();
    this.occluders.length = 0;
  }
}
