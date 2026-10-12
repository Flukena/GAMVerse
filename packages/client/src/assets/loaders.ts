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
