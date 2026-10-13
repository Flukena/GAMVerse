type RoomPropAssetPathDefinition = {
  asset: string;
  format?: string;
  model?: string;
  modelUrl?: string;
  materialUrl?: string;
  pack?: string;
  preview?: string;
};

export function roomPropAssetPaths(item: RoomPropAssetPathDefinition) {
  const model = item.model ?? item.asset;
  if (item.format === "gltf") {
    const assetRoot = item.pack?.startsWith("poly-pizza/") ? "/assets" : "/assets/kenney";
    if (item.modelUrl) return { format: "gltf" as const, modelUrl: item.modelUrl };
    if (item.pack) return { format: "gltf" as const, modelUrl: `${assetRoot}/${item.pack}/Models/${model}.glb` };

    // Older catalog entries store a preview URL but omit pack/modelUrl. Infer
    // their actual model folder from the preview's pack root. Before this,
    // 512 glTF props were incorrectly requested from the OBJ furniture folder,
    // leaving 3D thumbnails and placement previews stuck or blank.
    const previewRoot = item.preview?.match(/^(.*)\/(?:Previews(?:\/|$)|Preview(?:_[^/.]+)?(?:[./]|$))/)?.[1];
    if (previewRoot) {
      const modelRoot = `${previewRoot}/Models/${model}`;
      return { format: "gltf" as const, modelUrl: `${modelRoot}.glb` };
    }
  }
  if (item.materialUrl) return { format: "obj" as const, materialUrl: item.materialUrl, modelUrl: item.modelUrl ?? `${item.asset}.obj` };
  const base = item.model ? "/assets/kenney/furniture-kit/Models/" : "/assets/kenney/furniture/";
  return { format: "obj" as const, materialUrl: `${base}${model}.mtl`, modelUrl: `${base}${model}.obj` };
}
