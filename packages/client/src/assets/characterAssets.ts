import * as THREE from "three";
import { loadGltfAsset } from "./loaders";

export type LoadedCharacterAsset = { scene: THREE.Group; animations: THREE.AnimationClip[] };

export const QUATERNIUS_CHARACTERS = {
  "character-zombie-matt": {
    label: "Matt · Survivor",
    source: "Quaternius Zombie Apocalypse Kit",
    modelUrl: "/assets/quaternius/zombie-apocalypse-kit/Models/Characters_Matt.gltf",
    preview: "/assets/quaternius/zombie-apocalypse-kit/Preview_AllModels.jpg",
  },
} as const;

const cache = new Map<string, Promise<LoadedCharacterAsset>>();

export function loadCharacterAsset(characterId: string, customEndpoint: string): Promise<LoadedCharacterAsset> {
  const isCustom = characterId.startsWith("custom-");
  const quaterniusCharacter = QUATERNIUS_CHARACTERS[characterId as keyof typeof QUATERNIUS_CHARACTERS];
  const url = isCustom
    ? `${customEndpoint}/auth/models/${encodeURIComponent(characterId)}/model`
    : quaterniusCharacter
      ? quaterniusCharacter.modelUrl
    : characterId.startsWith("character-blocky-")
      ? `/assets/kenney/blocky-characters/character-${characterId.slice("character-blocky-".length)}.glb`
      : `/assets/kenney/mini-characters/${characterId}.glb`;
  let loaded = cache.get(url);
  if (!loaded) {
    loaded = loadGltfAsset(url).then((gltf) => ({ scene: gltf.scene, animations: gltf.animations }));
    cache.set(url, loaded);
    void loaded.catch(() => cache.delete(url));
  }
  return loaded;
}
