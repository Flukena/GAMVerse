import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ROOM_PROP_CATALOG } from "@gammyverse/shared";
import { loadRoomPropAsset } from "../assets/loaders";
import { roomPropAssetPaths } from "../assets/roomPropPaths";
import { createOfficePropGeometry } from "../world/officePropGeometry";

type CatalogItem = (typeof ROOM_PROP_CATALOG)[number];
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

function renderPropThumbnail(item: CatalogItem): Promise<string> {
  const cached = thumbnailCache.get(item.asset);
  if (cached) return Promise.resolve(cached);
  const result = renderQueue.then(async () => {
    const model = item.geometry
      ? createOfficePropGeometry(item.geometry)
      : await loadRoomPropAsset(roomPropAssetPaths(item));
    if (!model) throw new Error(`No preview model is available for ${item.asset}.`);
    const renderer = getRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 128 / 88, 0.01, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x73818a, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(3, 6, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc6e9f3, 1.1);
    fill.position.set(-4, 2, -3);
    scene.add(fill);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const heightScale = item.height / Math.max(size.y, 0.001);
    const fitScale = Math.min(
      item.width / Math.max(size.x * heightScale, 0.001),
      item.depth / Math.max(size.z * heightScale, 0.001),
    );
    const scale = heightScale * fitScale;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    model.rotation.y = Math.PI * 0.18;
    scene.add(model);
    const frameSize = Math.max(item.width, item.depth, item.height, 0.5);
    camera.position.set(frameSize * 1.55, frameSize * 1.12, frameSize * 1.7);
    camera.lookAt(0, item.height * 0.35, 0);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL("image/png");
    thumbnailCache.set(item.asset, url);
    scene.remove(model);
    if (item.geometry) model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
    return url;
  });
  renderQueue = result.catch(() => undefined);
  return result;
}

type Props = { item: CatalogItem; preview?: string; packPreview?: boolean };

/** Uses a real, lazily rendered 3D thumbnail when a dedicated image is absent. */
export function PropThumbnail({ item, preview, packPreview = false }: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [thumbnail, setThumbnail] = useState(() => thumbnailCache.get(item.asset) ?? "");
  const canRenderModel = Boolean(item.geometry || item.modelUrl || item.model);

  useEffect(() => {
    if (!canRenderModel || thumbnail) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const load = () => { void renderPropThumbnail(item).then((url) => { if (!cancelled) setThumbnail(url); }).catch(() => undefined); };
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
  }, [canRenderModel, item, thumbnail]);

  if (preview && !packPreview) return <img src={preview} alt="" loading="lazy" />;
  if (thumbnail) return <img src={thumbnail} alt="" />;
  if (!canRenderModel && preview) return <img src={preview} alt="" loading="lazy" />;
  return <span ref={hostRef} className="modify-props-thumbnail-loading" aria-hidden="true">▧</span>;
}
