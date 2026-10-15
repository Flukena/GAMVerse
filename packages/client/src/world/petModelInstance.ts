import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { hasLargeSkinnedMeshScale } from "./petModelCompatibility";

const PET_HEIGHT_M = 0.92;
const PET_MIN_MODEL_HEIGHT_M = 0.001;

export interface PetModelInstance {
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  idle?: THREE.AnimationAction;
  walk?: THREE.AnimationAction;
  current?: THREE.AnimationAction;
  dispose(): void;
}

/** Dispose a private parse, or a cache entry after every instance is removed. */
export function disposePetAsset(asset: Pick<GLTF, "scene" | "scenes">): void {
  disposePetResources(new Set([asset.scene, ...asset.scenes]), true);
}

function disposePetResources(roots: Iterable<THREE.Object3D>, ownsMeshResources: boolean): void {
  const resources = new Set<{ dispose(): void }>();
  for (const root of roots) root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.SkinnedMesh) resources.add(object.skeleton);
    if (!ownsMeshResources) return;
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) resources.add(value);
      }
    }
  });
  for (const resource of resources) resource.dispose();
}

export async function createPetModelInstance(
  template: GLTF,
  loadPrivateAsset: () => Promise<GLTF>,
  isCurrent: () => boolean,
): Promise<PetModelInstance | null> {
  if (!isCurrent()) return null;
  // Large mesh scales require the original parsed skeleton bindings.
  const ownsMeshResources = hasLargeSkinnedMeshScale(template.scene);
  const asset = ownsMeshResources ? await loadPrivateAsset() : template;
  if (!isCurrent()) {
    if (ownsMeshResources) disposePetAsset(asset);
    return null;
  }
  const model = ownsMeshResources ? asset.scene : SkeletonUtils.clone(asset.scene);
  const mixer = new THREE.AnimationMixer(model);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    model.removeFromParent();
    if (ownsMeshResources) disposePetAsset(asset);
    else disposePetResources([model], false);
  };
  try {
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = PET_HEIGHT_M / Math.max(size.y, PET_MIN_MODEL_HEIGHT_M);
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    model.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.frustumCulled = false;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    const idleClip = asset.animations.find(clip => clip.name.toLowerCase() === "idle")
      ?? asset.animations.find(clip => clip.name.toLowerCase() === "static");
    const walkClip = asset.animations.find(clip => clip.name.toLowerCase() === "walk")
      ?? asset.animations.find(clip => clip.name.toLowerCase() === "run");
    const idle = idleClip ? mixer.clipAction(idleClip) : undefined;
    const walk = walkClip ? mixer.clipAction(walkClip) : undefined;
    const current = idle ?? walk;
    current?.play();
    return { model, mixer, idle, walk, current, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
