import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

// Runtime models live in packages/client/public/assets. Use Three's shared file
// cache and loader instances so world, editor, and preview requests reuse fetched
// model and texture bytes instead of starting independent downloads.
THREE.Cache.enabled = true;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/assets/draco/");
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
const mtlLoader = new MTLLoader();
type RoomPropModelPaths =
  | { format: "gltf"; modelUrl: string }
  | { format: "obj"; materialUrl: string; modelUrl: string };
const roomPropTemplateCache = new Map<string, Promise<THREE.Group>>();

function waitForObjTexture(texture: THREE.Texture): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let listenersAdded = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timeout);
      resolve();
    };
    const inspect = () => {
      const image = texture.image as (HTMLImageElement & EventTarget) | undefined;
      if (!image) return;
      if (image.complete || image.width > 0 || typeof image.addEventListener !== "function") return finish();
      if (listenersAdded) return;
      listenersAdded = true;
      image.addEventListener("load", finish, { once: true });
      // Preserve the model's base material when an optional texture is absent.
      image.addEventListener("error", finish, { once: true });
    };
    const poll = setInterval(inspect, 20);
    const timeout = setTimeout(finish, 5000);
    inspect();
  });
}

export function loadGltfAsset(url: string): Promise<GLTF> {
  return gltfLoader.loadAsync(encodeURI(url));
}

export async function loadObjAsset(mtlUrl: string, objUrl: string): Promise<THREE.Group> {
  const materials = await mtlLoader.loadAsync(encodeURI(mtlUrl));
  materials.preload();
  const loader = new OBJLoader();
  loader.setMaterials(materials);
  const model = await loader.loadAsync(encodeURI(objUrl));

  // MTLLoader returns before its referenced atlas images have necessarily
  // finished loading. Rendered prop thumbnails are cached on first draw, so
  // that race left OBJ props permanently black/blank even though the model
  // and texture URLs were valid.
  const textureLoads: Promise<void>[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) {
        if (!(value instanceof THREE.Texture)) continue;
        textureLoads.push(waitForObjTexture(value));
      }
    }
  });
  if (textureLoads.length) await Promise.all(textureLoads);
  return model;
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
