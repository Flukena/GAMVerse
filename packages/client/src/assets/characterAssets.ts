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

const QUATERNIUS_PET_NAMES = [
  "Alien", "Alien_Tall", "Bat", "Bee", "Cactus", "Chicken", "Crab", "Cthulhu", "Cyclops", "Deer", "Demon", "Ghost",
  "GreenDemon", "Mushroom", "Panda", "Penguin", "Pig", "Skull", "Tree", "YellowDragon", "Yeti",
] as const;

export const QUATERNIUS_PETS = Object.fromEntries(QUATERNIUS_PET_NAMES.map((name) => {
  const normalized = name.replaceAll("_", "-").replace(/([a-z])([A-Z])/g, "$1-$2");
  const id = `quaternius-monster-${normalized.toLowerCase()}`;
  return [id, {
    label: normalized.replaceAll("-", " "),
    modelUrl: `/assets/quaternius/cute-animated-monsters/Models/${name}.gltf`,
    preview: "/assets/quaternius/cute-animated-monsters/Preview.jpg",
  }];
})) as Record<string, { label: string; modelUrl: string; preview: string }>;

export function quaterniusPet(id: string) {
  return QUATERNIUS_PETS[id];
}

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
