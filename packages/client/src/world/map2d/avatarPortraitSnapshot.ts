import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { loadCharacterAsset } from "../../assets/characterAssets";

export const PORTRAIT_EDGE_PX = 96;
const HEAD_CENTER_HEIGHT_RATIO = 0.86;
const HEAD_FRAME_HEIGHT_RATIO = 0.44;
const CAMERA_NEAR_M = 0.01;
const CAMERA_FAR_M = 100;
const CAMERA_DISTANCE_HEIGHT_RATIO = 2;
const MODEL_MIN_HEIGHT_M = 0.001;
const SNAPSHOT_IDLE_TIMEOUT_MS = 1000;
const SNAPSHOT_FALLBACK_DELAY_MS = 16;
const PORTRAIT_LIGHT_PALETTE = { clear: 0x000000, sky: 0xeaf8ff, ground: 0x637887, key: 0xffffff };
const HEMISPHERE_INTENSITY = 2.1;
const KEY_LIGHT_INTENSITY = 2.8;
const KEY_LIGHT_POSITION_M = { x: 3.8, y: 5.5, z: 4.8 };

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
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setSize(PORTRAIT_EDGE_PX, PORTRAIT_EDGE_PX, false);
    renderer.setClearColor(PORTRAIT_LIGHT_PALETTE.clear, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return renderer;
}
function renderHead(asset: Awaited<ReturnType<typeof loadCharacterAsset>>): HTMLCanvasElement {
  const model = SkeletonUtils.clone(asset.scene);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const heightM = Math.max(bounds.max.y - bounds.min.y, MODEL_MIN_HEIGHT_M);
  const headY = bounds.min.y + heightM * HEAD_CENTER_HEIGHT_RATIO;
  const halfFrameM = heightM * HEAD_FRAME_HEIGHT_RATIO / 2;
  const camera = new THREE.OrthographicCamera(-halfFrameM, halfFrameM, halfFrameM, -halfFrameM, CAMERA_NEAR_M, CAMERA_FAR_M);
  camera.position.set(center.x, headY, bounds.max.z + heightM * CAMERA_DISTANCE_HEIGHT_RATIO);
  camera.lookAt(center.x, headY, center.z);
  const scene = new THREE.Scene();
  scene.add(model, new THREE.HemisphereLight(PORTRAIT_LIGHT_PALETTE.sky, PORTRAIT_LIGHT_PALETTE.ground, HEMISPHERE_INTENSITY));
  const keyLight = new THREE.DirectionalLight(PORTRAIT_LIGHT_PALETTE.key, KEY_LIGHT_INTENSITY);
  keyLight.position.set(KEY_LIGHT_POSITION_M.x, KEY_LIGHT_POSITION_M.y, KEY_LIGHT_POSITION_M.z);
  scene.add(keyLight);
  const sharedRenderer = snapshotRenderer();
  try {
    sharedRenderer.render(scene, camera);
    const canvas = document.createElement("canvas");
    canvas.width = PORTRAIT_EDGE_PX;
    canvas.height = PORTRAIT_EDGE_PX;
    canvas.getContext("2d")?.drawImage(sharedRenderer.domElement, 0, 0);
    return canvas;
  } finally {
    // SkeletonUtils clones skeletons; geometry/materials belong to the shared asset cache.
    model.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
    });
    scene.clear();
  }
}
function waitForSnapshotIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: SNAPSHOT_IDLE_TIMEOUT_MS });
    } else {
      setTimeout(resolve, SNAPSHOT_FALLBACK_DELAY_MS);
    }
  });
}
async function processRequest(request: SnapshotRequest): Promise<void> {
  const asset = await loadCharacterAsset(request.characterId, request.endpoint);
  await waitForSnapshotIdle();
  if (request.active()) request.complete(renderHead(asset));
}
async function drainQueue(): Promise<void> {
  draining = true;
  try {
    while (queue.length) {
      const request = queue.shift();
      if (!request?.active()) continue;
      // Failed model loads or unavailable WebGL leave the initials fallback cached.
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
  queue.push(request);
  if (!draining) void drainQueue();
}
