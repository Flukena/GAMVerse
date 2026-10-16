import * as THREE from "three";
import { loadGltfAsset } from "../assets/loaders";

export type WorldDestination = { x: number; z: number };

const MAGIC_CIRCLE_MODEL_URL = "/assets/pixor/magic-circle/magic-circle.glb";
const OFFSCREEN_INDICATOR_SIZE_PX = 44;

/** A glowing animated magic circle placed at the active world-space destination. */
export function createWorldDestinationBeacon(host: HTMLElement, scene: THREE.Scene) {
  // Keep a small screen-space marker only when the destination is outside the
  // camera view. The actual destination is marked by Pixor's animated GLB.
  const offscreenIndicator = document.createElement("div");
  offscreenIndicator.className = "world-destination-beacon";
  offscreenIndicator.setAttribute("role", "img");
  offscreenIndicator.setAttribute("aria-label", "Selected travel destination outside the camera view");
  Object.assign(offscreenIndicator.style, {
    position: "fixed",
    zIndex: "25",
    display: "none",
    width: `${OFFSCREEN_INDICATOR_SIZE_PX}px`,
    height: `${OFFSCREEN_INDICATOR_SIZE_PX}px`,
    pointerEvents: "none",
    transform: "translate(-50%, -50%)",
    filter: "drop-shadow(0 0 8px rgba(157, 110, 255, .65))",
    color: "#d8c4ff",
  } satisfies Partial<CSSStyleDeclaration>);

  const outerRing = document.createElement("span");
  Object.assign(outerRing.style, {
    position: "absolute",
    inset: "3px",
    borderRadius: "50%",
    border: "2px solid rgba(211, 183, 255, .95)",
    boxShadow: "inset 0 0 8px rgba(191, 148, 255, .55), 0 0 7px rgba(191, 148, 255, .65)",
    boxSizing: "border-box",
  } satisfies Partial<CSSStyleDeclaration>);
  const innerRing = document.createElement("span");
  Object.assign(innerRing.style, {
    position: "absolute",
    inset: "9px",
    borderRadius: "50%",
    border: "1px dashed rgba(232, 216, 255, .95)",
    boxSizing: "border-box",
  } satisfies Partial<CSSStyleDeclaration>);
  const center = document.createElement("span");
  Object.assign(center.style, {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    transform: "translate(-50%, -50%)",
    background: "#fff",
    boxShadow: "0 0 5px 3px rgba(201, 162, 255, .95), 0 0 13px 6px rgba(148, 102, 255, .55)",
  } satisfies Partial<CSSStyleDeclaration>);
  offscreenIndicator.append(outerRing, innerRing, center);
  document.body.appendChild(offscreenIndicator);

  const modelRoot = new THREE.Group();
  modelRoot.name = "Automove destination magic circle";
  modelRoot.visible = false;
  modelRoot.renderOrder = 10;
  scene.add(modelRoot);

  const target = new THREE.Vector3();
  let hasTarget = false;
  let disposed = false;
  let mixer: THREE.AnimationMixer | null = null;
  let lastFrameAt = performance.now();

  const disposeModel = (root: THREE.Object3D) => {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    });
  };

  void loadGltfAsset(MAGIC_CIRCLE_MODEL_URL).then((gltf) => {
    if (disposed) {
      disposeModel(gltf.scene);
      return;
    }
    modelRoot.add(gltf.scene);
    if (gltf.animations.length) {
      mixer = new THREE.AnimationMixer(gltf.scene);
      for (const clip of gltf.animations) mixer.clipAction(clip).play();
    }
  }).catch((error: unknown) => {
    console.warn("Could not load the automove magic-circle model.", error);
  });

  return {
    setTarget(position: WorldDestination) {
      target.set(position.x, 0.025, position.z);
      hasTarget = true;
      modelRoot.position.copy(target);
    },
    clearTarget() {
      hasTarget = false;
      modelRoot.visible = false;
      offscreenIndicator.style.display = "none";
    },
    render(camera: THREE.Camera, visible: boolean) {
      const now = performance.now();
      mixer?.update(Math.min(0.05, Math.max(0, (now - lastFrameAt) / 1000)));
      lastFrameAt = now;
      if (!hasTarget || !visible || host.clientWidth <= 0 || host.clientHeight <= 0) {
        modelRoot.visible = false;
        offscreenIndicator.style.display = "none";
        return;
      }
      camera.updateMatrixWorld();
      const projected = target.clone().project(camera);
      const offscreen = projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      modelRoot.visible = !offscreen;
      offscreenIndicator.style.display = offscreen ? "block" : "none";
      if (!offscreen) return;

      if (projected.z < -1) { projected.x *= -1; projected.y *= -1; }
      // Keep an edge indicator when following the character puts the target
      // outside the camera view. The world marker remains pinned to its spot.
      projected.x = THREE.MathUtils.clamp(projected.x, -0.9, 0.9);
      projected.y = THREE.MathUtils.clamp(projected.y, -0.9, 0.9);
      const bounds = host.getBoundingClientRect();
      offscreenIndicator.style.opacity = "0.82";
      offscreenIndicator.style.left = `${bounds.left + (projected.x * 0.5 + 0.5) * bounds.width}px`;
      offscreenIndicator.style.top = `${bounds.top + (-projected.y * 0.5 + 0.5) * bounds.height}px`;
      const rotation = now / 90;
      outerRing.style.transform = `rotate(${rotation}deg)`;
      innerRing.style.transform = `rotate(${-rotation * 1.4}deg)`;
    },
    dispose() {
      disposed = true;
      hasTarget = false;
      mixer?.stopAllAction();
      mixer = null;
      scene.remove(modelRoot);
      disposeModel(modelRoot);
      offscreenIndicator.remove();
    },
  };
}
