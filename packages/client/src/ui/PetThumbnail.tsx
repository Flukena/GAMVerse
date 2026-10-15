import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import type { KenneyPetId } from "@gammyverse/shared";
import { loadGltfAsset } from "../assets/loaders";
import { quaterniusPet } from "../assets/characterAssets";

const thumbnailCache = new Map<string, string>();
let thumbnailRenderer: THREE.WebGLRenderer | null = null;
let renderQueue: Promise<unknown> = Promise.resolve();

function getRenderer() {
  if (thumbnailRenderer) return thumbnailRenderer;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setSize(128, 88, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  thumbnailRenderer = renderer;
  return renderer;
}

function petModelUrl(petId: KenneyPetId) {
  return quaterniusPet(petId)?.modelUrl ?? `/assets/kenney/cube-pets/Models/${petId}.glb`;
}

function renderPetThumbnail(petId: KenneyPetId): Promise<string> {
  const url = petModelUrl(petId);
  const cached = thumbnailCache.get(url);
  if (cached) return Promise.resolve(cached);
  const result = renderQueue.then(async () => {
    const gltf = await loadGltfAsset(url);
    const model = SkeletonUtils.clone(gltf.scene) as THREE.Group;
    const renderer = getRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 128 / 88, 0.01, 40);
    scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x637887, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc6e9f3, 1.1);
    fill.position.set(-4, 2, -3);
    scene.add(fill);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 1.25 / Math.max(size.y, size.x, size.z, 0.001);
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    model.rotation.y = Math.PI * 0.14;
    scene.add(model);
    camera.position.set(1.9, 1.3, 2.7);
    camera.lookAt(0, 0.53, 0);
    renderer.render(scene, camera);
    const thumbnail = renderer.domElement.toDataURL("image/png");
    thumbnailCache.set(url, thumbnail);
    scene.remove(model);
    return thumbnail;
  });
  renderQueue = result.catch(() => undefined);
  return result;
}

export function PetThumbnail({ petId, fallbackPreview }: { petId: KenneyPetId; fallbackPreview: string }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const url = petModelUrl(petId);
  const [thumbnail, setThumbnail] = useState(() => thumbnailCache.get(url) ?? "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (thumbnail || failed) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const load = () => {
      void renderPetThumbnail(petId).then((image) => { if (!cancelled) setThumbnail(image); }).catch(() => { if (!cancelled) setFailed(true); });
    };
    if (typeof IntersectionObserver === "undefined") load();
    else {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      }, { rootMargin: "120px" });
      observer.observe(host);
      return () => { cancelled = true; observer.disconnect(); };
    }
    return () => { cancelled = true; };
  }, [failed, petId, thumbnail]);

  if (thumbnail) return <img src={thumbnail} alt="" />;
  if (failed) return <img src={fallbackPreview} alt="" loading="lazy" />;
  return <span ref={hostRef} className="companion-thumbnail-loading" aria-hidden="true" />;
}
