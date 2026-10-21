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

const POLYGONAL_MIND_MODEL_FILES = [
  ["character-pm-jimmy", "Jimmy", "100Avatars_003_Jimmy.vrm", "character-pm-jimmy.png"],
  ["character-pm-old-moustache", "Old Moustache", "100Avatars_004_OldMoustache.vrm", "character-pm-old-moustache.png"],
  ["character-pm-cappy", "Cappy", "100Avatars_006_Cappy.vrm", "character-pm-cappy.png"],
  ["character-pm-observer", "Observer", "100Avatars_007_Observer.vrm", "character-pm-observer.png"],
  ["character-pm-hugo", "Hugo", "100Avatars_008_Hugo.vrm", "character-pm-hugo.png"],
  ["character-pm-chill", "Chill", "100Avatars_012_Chill.vrm", "character-pm-chill.png"],
  ["character-pm-retroman", "Retroman", "100Avatars_018_Retroman.vrm", "character-pm-retroman.png"],
  ["character-pm-kate", "Kate", "100Avatars_038_Kate.vrm", "character-pm-kate.png"],
  ["character-pm-mafiossini", "Mafiossini", "100Avatars_046_Mafiossini.vrm", "character-pm-mafiossini.png"],
  ["character-pm-david", "David", "100Avatars_047_David.vrm", "character-pm-david.png"],
  ["character-pm-samuela", "Samuela", "100Avatars_050_Samuela.vrm", "character-pm-samuela.png"],
  ["character-pm-jennifer", "Jennifer", "100Avatars_052_Jennifer.vrm", "character-pm-jennifer.png"],
  ["character-pm-erika", "Erika", "100Avatars_053_Erika.vrm", "character-pm-erika.png"],
  ["character-pm-lydia", "Lydia", "100Avatars_054_Lydia.vrm", "character-pm-lydia.png"],
  ["character-pm-olivia", "Olivia", "100Avatars_056_Olivia.vrm", "character-pm-olivia.png"],
  ["character-pm-rose", "Rose", "100Avatars_057_Rose.vrm", "character-pm-rose.png"],
  ["character-pm-shiro", "Shiro", "100Avatars_058_Shiro.vrm", "character-pm-shiro.png"],
  ["character-pm-kyle", "Kyle", "100Avatars_069_Kyle.vrm", "character-pm-kyle.png"],
  ["character-pm-robert", "Robert", "100Avatars_070_Robert.vrm", "character-pm-robert.png"],
  ["character-pm-lilbro", "Lil Bro", "100Avatars_071_LilBro.vrm", "character-pm-lilbro.png"],
  ["character-pm-mikel", "Mikel", "100Avatars_072_Mikel.vrm", "character-pm-mikel.png"],
  ["character-pm-baldman", "Baldman", "100Avatars_074_Baldman.vrm", "character-pm-baldman.png"],
] as const;

export const POLYGONAL_MIND_CHARACTERS = Object.fromEntries(POLYGONAL_MIND_MODEL_FILES.map(([id, label, file, thumbnail]) => [id, {
  label,
  source: "Polygonal Mind 100 Avatars · CC0",
  modelUrl: `/assets/external/characters/polygonal-mind-100-avatars/${file}`,
  preview: `/assets/external/characters/polygonal-mind-100-avatars/${thumbnail}`,
}])) as Record<string, { label: string; source: string; modelUrl: string; preview: string }>;

export function polygonalMindCharacter(id: string) {
  return POLYGONAL_MIND_CHARACTERS[id];
}

const KAYKIT_ADVENTURERS = [
  ["character-kaykit-barbarian", "Barbarian", "Barbarian"],
  ["character-kaykit-knight", "Knight", "Knight"],
  ["character-kaykit-mage", "Mage", "Mage"],
  ["character-kaykit-ranger", "Ranger", "Ranger"],
  ["character-kaykit-rogue", "Rogue", "Rogue"],
  ["character-kaykit-rogue-hooded", "Rogue · Hooded", "Rogue_Hooded"],
] as const;

export const KAYKIT_CHARACTERS = Object.fromEntries(KAYKIT_ADVENTURERS.map(([id, label, file]) => [id, {
  label,
  source: "KayKit Adventurers · CC0",
  modelUrl: `/assets/external/characters/kaykit-adventurers/${file}.glb`,
  preview: `/assets/external/characters/kaykit-adventurers/${file}.png`,
}])) as Record<string, { label: string; source: string; modelUrl: string; preview: string }>;

export function kaykitCharacter(id: string) {
  return KAYKIT_CHARACTERS[id];
}

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

const GOBKIT_PET_PACKS = {
  "gobkit-free": ["minion-a01", "minion-a02", "minion-b01", "minion-b02", "minion-c01", "minion-c02", "minion-d01", "minion-d02"],
  "gobkit-animal": ["Anglerfish", "Bat", "Corgi", "Duck", "Hippo", "Jellyfish", "Platypus", "Red", "Rhino", "Shark"],
  "gobkit-animalB": ["Bee", "Blue", "Boar", "Fugu", "Goat", "Marmot", "Owl", "Rat", "Seal", "Whale"],
  "gobkit-dino": ["Ankylosaurus", "Carnotaurus", "Oviraptor", "Pachycephalosaurus", "Plesiosaurus", "Pterodactylus", "Spinosaurus", "Stegosaurus", "Trex", "Triceratops"],
  "gobkit-birds": ["Eagle", "Flamingo", "Hummingbird", "Kiwi", "Macaw", "Peacock", "Pelican", "Penguin", "Rooster", "Toucan"],
  "gobkit-farm": ["BlackSheep", "Bull", "Calf", "HighlandCow", "HolsteinCow", "Lamb", "Pig", "Piglet", "Sheep", "SpottedPig"],
  "gobkit-animal006": ["BlueTang", "Doe", "Elephant", "Fox", "Goose", "Hare", "Hedgehog", "Lion", "Squirrel", "Zebra"],
} as const;

const gobkitPackSlugs: Record<keyof typeof GOBKIT_PET_PACKS, string> = {
  "gobkit-free": "minion",
  "gobkit-animal": "animal",
  "gobkit-animalB": "animalb",
  "gobkit-dino": "dino",
  "gobkit-birds": "bird",
  "gobkit-farm": "farm",
  "gobkit-animal006": "animal006",
};

export const GOBKIT_PETS = Object.fromEntries(Object.entries(GOBKIT_PET_PACKS).flatMap(([pack, names]) =>
  names.map((name) => {
    const slug = gobkitPackSlugs[pack as keyof typeof gobkitPackSlugs];
    const file = name.toLowerCase();
    const id = pack === "gobkit-free" ? `gobkit-pet-${file}` : `gobkit-pet-${slug}-${file}`;
    const label = name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("-", " ");
    return [id, {
      label,
      source: "Gobkit Free Pack · CC0 1.0",
      modelUrl: `/assets/external/pets/gobkit/${pack}/${name}.glb`,
    }];
  }),
)) as Record<string, { label: string; source: string; modelUrl: string }>;

const gobkitPetThumbnailIndices = new Map(Object.keys(GOBKIT_PETS).map((id, index) => [id, index]));
export const GOBKIT_PET_THUMBNAIL_ATLAS = "/assets/external/pets/gobkit/gobkit-pet-thumbnails.png";

export function gobkitPetThumbnailPosition(id: string): { x: number; y: number } | undefined {
  const index = gobkitPetThumbnailIndices.get(id);
  if (index === undefined) return undefined;
  return { x: index % 8, y: Math.floor(index / 8) };
}

export function gobkitPet(id: string): { label: string; source: string; modelUrl: string; preview?: string } | undefined {
  return GOBKIT_PETS[id];
}

export function petModelUrl(id: string) {
  return gobkitPet(id)?.modelUrl ?? quaterniusPet(id)?.modelUrl ?? `/assets/kenney/cube-pets/Models/${id}.glb`;
}

export function petPreviewUrl(id: string) {
  return gobkitPet(id)?.preview ?? quaterniusPet(id)?.preview ?? `/assets/kenney/cube-pets/Previews/${id}.png`;
}

const cache = new Map<string, Promise<LoadedCharacterAsset>>();
const VRM0_FORWARD_CORRECTION_RAD = Math.PI;

export function loadCharacterAsset(characterId: string, customEndpoint: string): Promise<LoadedCharacterAsset> {
  const isCustom = characterId.startsWith("custom-");
  const quaterniusCharacter = QUATERNIUS_CHARACTERS[characterId as keyof typeof QUATERNIUS_CHARACTERS];
  const polygonalMind = polygonalMindCharacter(characterId);
  const kaykit = kaykitCharacter(characterId);
  const url = isCustom
    ? `${customEndpoint}/auth/models/${encodeURIComponent(characterId)}/model`
    : quaterniusCharacter
      ? quaterniusCharacter.modelUrl
      : polygonalMind
        ? polygonalMind.modelUrl
        : kaykit
          ? kaykit.modelUrl
    : characterId.startsWith("character-blocky-")
      ? `/assets/kenney/blocky-characters/character-${characterId.slice("character-blocky-".length)}.glb`
      : `/assets/kenney/mini-characters/${characterId}.glb`;
  let loaded = cache.get(url);
  if (!loaded) {
    loaded = loadGltfAsset(url).then((gltf) => {
      const scene = new THREE.Group();
      // VRM 0 avatars face -Z; the world, picker and sprite directions use +Z.
      if (gltf.userData.gltfExtensions?.VRM) gltf.scene.rotation.y += VRM0_FORWARD_CORRECTION_RAD;
      scene.add(gltf.scene);
      return { scene, animations: gltf.animations };
    });
    cache.set(url, loaded);
    void loaded.catch(() => cache.delete(url));
  }
  return loaded;
}
