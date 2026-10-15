import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { loadCharacterAsset } from "../assets/characterAssets";
import { loadGltfAsset } from "../assets/loaders";
import { hasLargeSkinnedMeshScale } from "./petModelCompatibility";
import { createProceduralHumanoidRig, updateProceduralHumanoidRig } from "./proceduralHumanoidMotion";

type CharacterPreview3DProps = {
  characterId: string;
  modelUrl?: string;
  endpoint: string;
  label: string;
  fallbackImage?: string | null;
};

export function CharacterPreview3D({ characterId, modelUrl, endpoint, label, fallbackImage }: CharacterPreview3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let animationFrame = 0;
    let model: THREE.Group | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let proceduralRig: ReturnType<typeof createProceduralHumanoidRig> = null;
    let proceduralPhase = 0;
    let dragPointer: number | null = null;
    let lastPointerX = 0;
    let yaw = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    camera.position.set(0, 1.05, 4.4);
    camera.lookAt(0, 0.82, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.className = "character-preview-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x637887, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(-2.6, 4, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x8ecae6, 1.25);
    rimLight.position.set(3, 2.2, -2.5);
    scene.add(rimLight);

    const platformGeometry = new THREE.CylinderGeometry(0.72, 0.78, 0.055, 48);
    const platformMaterial = new THREE.MeshStandardMaterial({ color: 0xc6e6f1, roughness: 0.5, metalness: 0.08 });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = -0.035;
    platform.receiveShadow = true;
    scene.add(platform);

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const onPointerDown = (event: PointerEvent) => {
      dragPointer = event.pointerId;
      lastPointerX = event.clientX;
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    };
    const onPointerMove = (event: PointerEvent) => {
      if (dragPointer !== event.pointerId) return;
      yaw += (event.clientX - lastPointerX) * 0.012;
      lastPointerX = event.clientX;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (dragPointer !== event.pointerId) return;
      dragPointer = null;
      renderer.domElement.style.cursor = "grab";
    };
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);

    setLoadState("loading");
    const assetRequest = modelUrl
      ? loadGltfAsset(modelUrl).then((gltf) => ({ scene: gltf.scene, animations: gltf.animations }))
      : loadCharacterAsset(characterId, endpoint);
    void assetRequest.then((asset) => {
      if (disposed) return;
      const isolatedRig = modelUrl ? hasLargeSkinnedMeshScale(asset.scene) : false;
      model = (isolatedRig ? asset.scene : SkeletonUtils.clone(asset.scene)) as THREE.Group;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = 1.55 / Math.max(size.y, 0.001);
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      proceduralRig = characterId.startsWith("character-pm-") || characterId.startsWith("character-kaykit-") ? createProceduralHumanoidRig(model) : null;
      if (proceduralRig) updateProceduralHumanoidRig(proceduralRig, 0, false, false, false);
      scene.add(model);

      const idleClip = asset.animations.find((clip) => clip.name.toLowerCase() === "idle");
      const firstClip = idleClip ?? asset.animations[0];
      // Procedural humanoid models need their rig pose to remain authoritative;
      // a bundled clip can otherwise restore the source T-pose each frame.
      if (!proceduralRig && !reduceMotion && firstClip && !isolatedRig) {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(firstClip).play();
      }
      setLoadState("ready");
    }).catch(() => {
      if (!disposed) setLoadState("error");
    });

    const render = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      mixer?.update(delta);
      if (proceduralRig && !reduceMotion) {
        proceduralPhase += delta * 1.8;
        updateProceduralHumanoidRig(proceduralRig, proceduralPhase, false, false, true);
      }
      if (model && !reduceMotion && dragPointer === null) yaw += delta * 0.16;
      if (model) model.rotation.y = yaw;
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      mixer?.stopAllAction();
      // Character assets are cached and shared with the world renderer, so only
      // dispose this preview's own generated geometry and material.
      platformGeometry.dispose();
      platformMaterial.dispose();
      renderer.dispose();
      // This preview remounts whenever the selected character or pet changes.
      // Explicitly release the WebGL context so opening the picker or stepping
      // through many pets cannot exhaust the browser's per-page context limit
      // and blank out the office renderer.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [characterId, modelUrl, endpoint]);

  return <div ref={hostRef} className="character-preview-stage" role="img" aria-label={`3D preview of ${label}. Drag to rotate.`}>
    <div className={`character-preview-loading${loadState === "loading" ? " visible" : ""}`} aria-hidden="true"><span /></div>
    {loadState === "error" && fallbackImage && <img className="character-preview-fallback" src={fallbackImage} alt="" />}
    {loadState === "error" && !fallbackImage && <span className="character-preview-error">3D preview unavailable</span>}
    <span className="character-preview-hint" aria-hidden="true">Drag to rotate</span>
  </div>;
}
