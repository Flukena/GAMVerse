import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

// Runtime models live in packages/client/public/assets. Use Three's shared file
// cache and loader instances so world, editor, and preview requests reuse fetched
// model and texture bytes instead of starting independent downloads.
THREE.Cache.enabled = true;

const gltfLoader = new GLTFLoader();
const mtlLoader = new MTLLoader();
type RoomPropModelPaths =
  | { format: "gltf"; modelUrl: string }
  | { format: "obj"; materialUrl: string; modelUrl: string };
const roomPropTemplateCache = new Map<string, Promise<THREE.Group>>();

export function loadGltfAsset(url: string): Promise<GLTF> {
  return gltfLoader.loadAsync(encodeURI(url));
}

export async function loadObjAsset(mtlUrl: string, objUrl: string): Promise<THREE.Group> {
  const materials = await mtlLoader.loadAsync(encodeURI(mtlUrl));
  materials.preload();
  const loader = new OBJLoader();
  loader.setMaterials(materials);
  return loader.loadAsync(encodeURI(objUrl));
}

function loadRoomPropTemplate(paths: RoomPropModelPaths) {
  const key = paths.format === "gltf" ? `gltf:${paths.modelUrl}` : `obj:${paths.materialUrl}:${paths.modelUrl}`;
  let pending = roomPropTemplateCache.get(key);
  if (!pending) {
    pending = paths.format === "gltf"
      ? loadGltfAsset(paths.modelUrl).then((gltf) => gltf.scene as THREE.Group)
      : loadObjAsset(paths.materialUrl, paths.modelUrl);
    roomPropTemplateCache.set(key, pending);
    void pending.catch(() => roomPropTemplateCache.delete(key));
  }
  return pending;
}

/**
 * Preload one prop model while its catalog card is hovered/focused. The same
 * parsed template is shared with the placement preview and placed instances,
 * avoiding duplicate network requests and GLTF/OBJ parsing for repeated props.
 */
export function preloadRoomPropAsset(paths: RoomPropModelPaths): Promise<void> {
  return loadRoomPropTemplate(paths).then(() => undefined);
}

/** Return a transformable scene clone backed by immutable cached geometry/materials. */
export function loadRoomPropAsset(paths: RoomPropModelPaths): Promise<THREE.Group> {
  return loadRoomPropTemplate(paths).then((template) => {
    const clone = template.clone(true) as THREE.Group;
    clone.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.userData.sharedRoomPropGeometry = true;
        object.userData.sharedRoomPropMaterials = true;
      }
    });
    return clone;
  });
}
