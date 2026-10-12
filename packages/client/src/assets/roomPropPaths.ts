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
    return { format: "gltf" as const, modelUrl: item.modelUrl ?? `/assets/kenney/${item.pack}/Models/${model}.glb` };
  }
  const base = item.model ? "/assets/kenney/furniture-kit/Models/" : "/assets/kenney/furniture/";
  return { format: "obj" as const, materialUrl: `${base}${model}.mtl`, modelUrl: `${base}${model}.obj` };
}
