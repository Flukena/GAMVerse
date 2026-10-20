import { DoubleSide, Mesh, MeshBasicMaterial, type BufferGeometry } from "three";

export function createMapPropHitTarget(
  geometry: BufferGeometry,
  propId: string,
  kind: "support" | "drag",
): Mesh<BufferGeometry, MeshBasicMaterial> {
  const mesh = new Mesh(geometry, new MeshBasicMaterial({
    transparent: true, opacity: 0, colorWrite: false, depthWrite: false,
    ...(kind === "support" ? { side: DoubleSide } : {}),
  }));
  // Three.js raycasting includes invisible meshes, but rendering skips them.
  mesh.visible = false;
  mesh.userData.officeMapPropId = propId;
  mesh.userData[kind === "support" ? "mapPropSupportSurface" : "mapPropDragHitTarget"] = true;
  return mesh;
}
