import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ModifyPropsCatalogItem } from "./ModifyPropsEditor";
import { createOfficePropGeometry } from "../world/officePropGeometry";
import { loadGltfAsset, loadObjAsset } from "../assets/loaders";
import { roomPropAssetPaths } from "../assets/roomPropPaths";

type Props = { item: ModifyPropsCatalogItem; className?: string; label?: string };

/** Shows the selected asset itself at its catalog scale; unlike pack preview sheets this cannot depict a different prop. */
export function PropModelPreview({ item, className = "", label }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let objectUrl: string | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let object: THREE.Object3D | null = null;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e7eff0");
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.position.set(3.6, 2.8, 4.4);
    camera.lookAt(0, 0.72, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x73818a, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 6, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc6e9f3, 1.2);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    const attach = (model: THREE.Object3D) => {
      if (disposed) { disposeObject(model); return; }
      object = model;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const heightScale = item.height / Math.max(size.y, 0.001);
      const fitScale = Math.min(
        item.width / Math.max(size.x * heightScale, 0.001),
        item.depth / Math.max(size.z * heightScale, 0.001),
      );
      // Match in-world rendering: uniformly fit the model inside its footprint
      // so the preview never stretches its proportions.
      const scale = heightScale * fitScale;
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      model.rotation.y = Math.PI * 0.18;
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const material = child.material;
          for (const entry of Array.isArray(material) ? material : [material]) {
            if (entry instanceof THREE.MeshStandardMaterial || entry instanceof THREE.MeshPhysicalMaterial) {
              entry.roughness = Math.max(0.55, entry.roughness);
              entry.metalness = Math.min(0.18, entry.metalness);
            }
          }
        }
      });
      scene.add(model);
      setStatus("ready");
      resize();
    };
    const failed = (error: unknown) => {
      if (disposed) return;
      console.warn(`Could not render prop preview for ${item.asset}.`, error);
      setStatus("error");
    };

    try {
      if (item.geometry) {
        const model = createOfficePropGeometry(item.geometry);
        if (model) attach(model);
        else failed(new Error(`Unknown office prop geometry: ${item.geometry}`));
      } else {
        const paths = roomPropAssetPaths(item);
        const loaded = paths.format === "gltf"
          ? loadGltfAsset(paths.modelUrl).then((gltf) => gltf.scene)
          : loadObjAsset(paths.materialUrl, paths.modelUrl);
        void loaded.then(attach, failed);
      }
    } catch (error) { failed(error); }

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (object) { scene.remove(object); disposeObject(object); }
      scene.traverse((child) => { if (child instanceof THREE.Light) child.dispose?.(); });
      renderer.dispose();
      renderer.domElement.remove();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item]);

  return <div ref={hostRef} className={`prop-model-preview ${className}`} role="img" aria-label={label ?? `${item.label} 3D preview`}>
    {status === "loading" && <span className="prop-model-preview-status">Loading preview…</span>}
    {status === "error" && <span className="prop-model-preview-status">Preview unavailable</span>}
  </div>;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}
