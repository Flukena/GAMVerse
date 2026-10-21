import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { loadCharacterAsset, type LoadedCharacterAsset } from "../../assets/characterAssets";
import { createProceduralHumanoidRig, updateProceduralHumanoidRig, type ProceduralHumanoidRig } from "../proceduralHumanoidMotion";
import { applyLyingCharacterPose } from "../lyingCharacterPose";
import { rememberWebglFailure, webglFailedInThisTab } from "../webglFailureSession";
import {
  AVATAR_SPRITE_FRAME_HEIGHT_M, AVATAR_SPRITE_DIRECTION_COUNT, AVATAR_SPRITE_FULL_CIRCLE_RAD, AVATAR_SPRITE_POSE_COUNT,
  AVATAR_SPRITE_SEATED_POSE_INDEX, AVATAR_SPRITE_LYING_POSE_INDEX, AVATAR_SPRITE_TILE_HEIGHT_PX, AVATAR_SPRITE_TILE_WIDTH_PX,
  AVATAR_SPRITE_WALK_FRAME_COUNT,
} from "./avatarSpriteGeometry";

const CAMERA_NEAR_M = 0.01;
const CAMERA_FAR_M = 100;
const CAMERA_DISTANCE_M = 4;
const CAMERA_ELEVATION_M = 1.4;
const MODEL_HEIGHT_M = 1.6;
const MODEL_MIN_HEIGHT_M = 0.001;
const CAMERA_TARGET_HEIGHT_M = 0.85;
const SNAPSHOT_IDLE_TIMEOUT_MS = 1000;
const SNAPSHOT_FALLBACK_DELAY_MS = 16;
const PORTRAIT_LIGHT_PALETTE = { clear: 0x000000, sky: 0xeaf8ff, ground: 0x637887, key: 0xffffff };
const HEMISPHERE_INTENSITY = 2.1;
const KEY_LIGHT_INTENSITY = 2.8;
const KEY_LIGHT_POSITION_M = { x: 3.8, y: 5.5, z: 4.8 };
const SEATED_THIGH_ANGLE_RAD = -Math.PI / 2;
const SEATED_SHIN_ANGLE_RAD = Math.PI / 2;
const SEATED_ROOT_OFFSET_M = -0.25;
const SEATED_SAMPLE_DURATION_RATIO = 0.5;

type SnapshotRequest = {
  characterId: string;
  endpoint: string;
  active(): boolean;
  complete(portrait: HTMLCanvasElement | null): void;
};
const queue: SnapshotRequest[] = [];
let draining = false;
let renderer: THREE.WebGLRenderer | null = null;

function snapshotRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch (error) {
      rememberWebglFailure();
      throw error;
    }
    renderer.setSize(AVATAR_SPRITE_TILE_WIDTH_PX, AVATAR_SPRITE_TILE_HEIGHT_PX, false);
    renderer.setClearColor(PORTRAIT_LIGHT_PALETTE.clear, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return renderer;
}
function snapshotScene(model: THREE.Object3D): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(model, new THREE.HemisphereLight(PORTRAIT_LIGHT_PALETTE.sky, PORTRAIT_LIGHT_PALETTE.ground, HEMISPHERE_INTENSITY));
  const keyLight = new THREE.DirectionalLight(PORTRAIT_LIGHT_PALETTE.key, KEY_LIGHT_INTENSITY);
  keyLight.position.set(KEY_LIGHT_POSITION_M.x, KEY_LIGHT_POSITION_M.y, KEY_LIGHT_POSITION_M.z);
  scene.add(keyLight);
  return scene;
}
function snapshotCamera(): THREE.OrthographicCamera {
  const halfHeightM = AVATAR_SPRITE_FRAME_HEIGHT_M / 2;
  const halfWidthM = halfHeightM * AVATAR_SPRITE_TILE_WIDTH_PX / AVATAR_SPRITE_TILE_HEIGHT_PX;
  const camera = new THREE.OrthographicCamera(-halfWidthM, halfWidthM, halfHeightM, -halfHeightM, CAMERA_NEAR_M, CAMERA_FAR_M);
  camera.position.set(0, CAMERA_ELEVATION_M, CAMERA_DISTANCE_M);
  camera.lookAt(0, CAMERA_TARGET_HEIGHT_M, 0);
  return camera;
}
function normalizeModel(model: THREE.Object3D): void {
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = MODEL_HEIGHT_M / Math.max(bounds.max.y - bounds.min.y, MODEL_MIN_HEIGHT_M);
  model.scale.multiplyScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
}
function poseSeatedRig(rig: ProceduralHumanoidRig): void {
  for (const thigh of [rig.leftLeg, rig.rightLeg]) {
    if (thigh) thigh.bone.quaternion.copy(thigh.rest).multiply(thigh.deltaA.setFromAxisAngle(thigh.axisA, SEATED_THIGH_ANGLE_RAD));
  }
  for (const shin of [rig.leftShin, rig.rightShin]) {
    if (shin) shin.bone.quaternion.copy(shin.rest).multiply(shin.deltaA.setFromAxisAngle(shin.axisA, SEATED_SHIN_ANGLE_RAD));
  }
}
function spritePose(model: THREE.Object3D, asset: LoadedCharacterAsset, characterId: string): (poseIndex: number) => void {
  const procedural = characterId.startsWith("character-pm-") || characterId.startsWith("character-kaykit-")
    ? createProceduralHumanoidRig(model) : null;
  const mixer = new THREE.AnimationMixer(model);
  const idle = asset.animations.find(clip => clip.name.toLowerCase() === "idle");
  const walk = asset.animations.find(clip => clip.name.toLowerCase() === "walk")
    ?? asset.animations.find(clip => clip.name.toLowerCase() === "run");
  const sit = asset.animations.find(clip => clip.name.toLowerCase() === "sit");
  return (poseIndex) => {
    const walking = poseIndex > 0 && poseIndex < AVATAR_SPRITE_SEATED_POSE_INDEX;
    const seated = poseIndex === AVATAR_SPRITE_SEATED_POSE_INDEX;
    const phaseRatio = walking ? (poseIndex - 1) / AVATAR_SPRITE_WALK_FRAME_COUNT : 0;
    if (procedural) {
      updateProceduralHumanoidRig(procedural, phaseRatio * AVATAR_SPRITE_FULL_CIRCLE_RAD, walking, false, false);
      if (seated) poseSeatedRig(procedural);
      return;
    }
    mixer.stopAllAction();
    const clip = seated ? sit ?? idle : walking ? walk ?? idle : idle;
    if (!clip) return;
    const action = mixer.clipAction(clip).reset().play();
    action.time = clip.duration * (seated ? SEATED_SAMPLE_DURATION_RATIO : phaseRatio);
    mixer.update(0);
  };
}
function waitForSnapshotIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: SNAPSHOT_IDLE_TIMEOUT_MS });
    else setTimeout(resolve, SNAPSHOT_FALLBACK_DELAY_MS);
  });
}
async function renderSprites(asset: LoadedCharacterAsset, request: SnapshotRequest): Promise<HTMLCanvasElement | null> {
  const model = SkeletonUtils.clone(asset.scene);
  normalizeModel(model);
  const root = new THREE.Group();
  root.add(model);
  const scene = snapshotScene(root);
  const camera = snapshotCamera();
  const lyingCamera = snapshotCamera();
  lyingCamera.position.set(0, CAMERA_DISTANCE_M, 0);
  lyingCamera.up.set(0, 0, -1);
  lyingCamera.lookAt(0, 0, 0);
  const restPosition = model.position.clone();
  const restRotation = model.rotation.clone();
  const setPose = spritePose(model, asset, request.characterId);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SPRITE_TILE_WIDTH_PX * AVATAR_SPRITE_POSE_COUNT;
  canvas.height = AVATAR_SPRITE_TILE_HEIGHT_PX * AVATAR_SPRITE_DIRECTION_COUNT;
  const ctx = canvas.getContext("2d");
  try {
    for (let direction = 0; direction < AVATAR_SPRITE_DIRECTION_COUNT; direction += 1) {
      await waitForSnapshotIdle();
      if (!request.active()) return null;
      root.rotation.y = direction / AVATAR_SPRITE_DIRECTION_COUNT * AVATAR_SPRITE_FULL_CIRCLE_RAD;
      for (let pose = 0; pose < AVATAR_SPRITE_POSE_COUNT; pose += 1) {
        if (webglFailedInThisTab()) return null;
        setPose(pose);
        const lying = pose === AVATAR_SPRITE_LYING_POSE_INDEX;
        applyLyingCharacterPose(model, lying, restPosition, restRotation);
        if (!lying) model.position.y = restPosition.y;
        root.position.y = pose === AVATAR_SPRITE_SEATED_POSE_INDEX ? SEATED_ROOT_OFFSET_M : 0;
        const sharedRenderer = snapshotRenderer();
        sharedRenderer.render(scene, lying ? lyingCamera : camera);
        ctx?.drawImage(sharedRenderer.domElement, pose * AVATAR_SPRITE_TILE_WIDTH_PX, direction * AVATAR_SPRITE_TILE_HEIGHT_PX);
      }
    }
    return canvas;
  } finally {
    // SkeletonUtils clones skeletons; geometry/materials belong to the shared asset cache.
    model.traverse((object) => { if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose(); });
    scene.clear();
  }
}
async function processRequest(request: SnapshotRequest): Promise<void> {
  if (webglFailedInThisTab()) { request.complete(null); return; }
  const asset = await loadCharacterAsset(request.characterId, request.endpoint);
  if (request.active()) request.complete(webglFailedInThisTab() ? null : await renderSprites(asset, request));
}
async function drainQueue(): Promise<void> {
  draining = true;
  try {
    while (queue.length) {
      const request = queue.shift();
      if (!request?.active()) continue;
      // Failed model loads or unavailable WebGL leave the full-body fallback.
      await processRequest(request).catch(() => request.complete(null));
    }
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer = null;
    draining = false;
  }
}
export function queueAvatarSnapshot(request: SnapshotRequest): void {
  if (webglFailedInThisTab()) { request.complete(null); return; }
  queue.push(request);
  if (!draining) void drainQueue();
}
