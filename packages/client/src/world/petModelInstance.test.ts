import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { createPetModelInstance, disposePetAsset } from "./petModelInstance.ts";

function petAsset(largeScale = false) {
  const scene = new THREE.Group();
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture });
  const geometry = new THREE.BoxGeometry();
  const vertexCount = geometry.attributes.position.count;
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4));
  const weights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index++) weights[index * 4] = 1;
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, material);
  const bone = new THREE.Bone();
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  if (largeScale) mesh.scale.setScalar(100);
  scene.add(mesh);
  const counts = { geometry: 0, material: 0, texture: 0, skeleton: 0 };
  geometry.addEventListener("dispose", () => counts.geometry++);
  material.addEventListener("dispose", () => counts.material++);
  texture.addEventListener("dispose", () => counts.texture++);
  const originalDispose = mesh.skeleton.dispose.bind(mesh.skeleton);
  mesh.skeleton.dispose = () => { counts.skeleton++; originalDispose(); };
  // Other GLTF metadata is irrelevant to an instance's resource ownership.
  const asset = { scene, scenes: [scene], animations: [] } as unknown as GLTF;
  return { asset, mesh, counts };
}

test("a private pet instance releases all owned resources once", async () => {
  const template = petAsset(true);
  const privatePet = petAsset(true);
  const instance = await createPetModelInstance(template.asset, async () => privatePet.asset, () => true);
  assert.ok(instance);
  const parent = new THREE.Group();
  parent.add(instance.model);
  instance.dispose();
  instance.dispose();
  assert.equal(parent.children.length, 0);
  assert.deepEqual(privatePet.counts, { geometry: 1, material: 1, texture: 1, skeleton: 1 });
  assert.deepEqual(template.counts, { geometry: 0, material: 0, texture: 0, skeleton: 0 });
});

test("a stale private parse is disposed when its player leaves during loading", async () => {
  const template = petAsset(true);
  const privatePet = petAsset(true);
  let current = true;
  let resolve!: (asset: GLTF) => void;
  const loading = new Promise<GLTF>(done => { resolve = done; });
  const result = createPetModelInstance(template.asset, () => loading, () => current);
  current = false;
  resolve(privatePet.asset);
  assert.equal(await result, null);
  assert.deepEqual(privatePet.counts, { geometry: 1, material: 1, texture: 1, skeleton: 1 });
  assert.equal(template.counts.geometry, 0);
});

test("ordinary clones release their skeleton and preserve shared template resources", async () => {
  const template = petAsset();
  const instance = await createPetModelInstance(template.asset, async () => { throw new Error("Unexpected private parse"); }, () => true);
  assert.ok(instance);
  const mesh = instance.model.children[0] as THREE.SkinnedMesh;
  assert.notEqual(mesh.skeleton, template.mesh.skeleton);
  mesh.skeleton.computeBoneTexture();
  let boneTextureDisposed = false;
  mesh.skeleton.boneTexture!.addEventListener("dispose", () => { boneTextureDisposed = true; });
  instance.dispose();
  assert.equal(boneTextureDisposed, true);
  assert.deepEqual(template.counts, { geometry: 0, material: 0, texture: 0, skeleton: 0 });
  disposePetAsset(template.asset);
  assert.deepEqual(template.counts, { geometry: 1, material: 1, texture: 1, skeleton: 1 });
});

test("an already stale player does not clone or privately parse a template", async () => {
  const template = petAsset(true);
  const instance = await createPetModelInstance(template.asset, async () => { throw new Error("Unexpected parse"); }, () => false);
  assert.equal(instance, null);
  assert.equal(template.counts.geometry, 0);
});
