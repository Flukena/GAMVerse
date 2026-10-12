type RoomPropAssetPathDefinition = {
  asset: string;
  format?: string;
  model?: string;
  modelUrl?: string;
  pack?: string;
};

export function roomPropAssetPaths(item: RoomPropAssetPathDefinition) {
  const model = item.model ?? item.asset;
  if (item.format === "gltf" && (item.modelUrl || item.pack)) {
    const assetRoot = item.pack?.startsWith("poly-pizza/") ? "/assets" : "/assets/kenney";
    return { format: "gltf" as const, modelUrl: item.modelUrl ?? `${assetRoot}/${item.pack}/Models/${model}.glb` };
  }
  const base = item.model ? "/assets/kenney/furniture-kit/Models/" : "/assets/kenney/furniture/";
  return { format: "obj" as const, materialUrl: `${base}${model}.mtl`, modelUrl: `${base}${model}.obj` };
}
