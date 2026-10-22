export const KENNEY_CHARACTER_IDS = [
  "character-female-a", "character-female-b", "character-female-c", "character-female-d", "character-female-e", "character-female-f",
  "character-male-a", "character-male-b", "character-male-c", "character-male-d", "character-male-e", "character-male-f",
  "character-blocky-a", "character-blocky-b", "character-blocky-c", "character-blocky-d", "character-blocky-e", "character-blocky-f",
  "character-blocky-g", "character-blocky-h", "character-blocky-i", "character-blocky-j", "character-blocky-k", "character-blocky-l",
  "character-blocky-m", "character-blocky-n", "character-blocky-o", "character-blocky-p", "character-blocky-q", "character-blocky-r",
  "character-zombie-matt",
  "character-pm-jimmy", "character-pm-old-moustache", "character-pm-cappy", "character-pm-observer", "character-pm-hugo",
  "character-pm-chill", "character-pm-retroman", "character-pm-kate", "character-pm-mafiossini", "character-pm-david",
  "character-pm-samuela", "character-pm-jennifer", "character-pm-erika", "character-pm-lydia", "character-pm-olivia",
  "character-pm-rose", "character-pm-shiro", "character-pm-kyle", "character-pm-robert", "character-pm-lilbro",
  "character-pm-mikel", "character-pm-baldman",
  "character-kaykit-barbarian", "character-kaykit-knight", "character-kaykit-mage", "character-kaykit-ranger",
  "character-kaykit-rogue", "character-kaykit-rogue-hooded",
] as const;
export type KenneyCharacterId = typeof KENNEY_CHARACTER_IDS[number];
export const DEFAULT_CHARACTER_ID: KenneyCharacterId = "character-female-a";

export const KENNEY_PET_IDS = [
  "animal-beaver", "animal-bee", "animal-bunny", "animal-cat", "animal-caterpillar", "animal-chick",
  "animal-cow", "animal-crab", "animal-deer", "animal-dog", "animal-elephant", "animal-fish",
  "animal-fox", "animal-giraffe", "animal-hog", "animal-koala", "animal-lion", "animal-monkey",
  "animal-panda", "animal-parrot", "animal-penguin", "animal-pig", "animal-polar", "animal-tiger",
  "quaternius-monster-alien", "quaternius-monster-alien-tall", "quaternius-monster-bat", "quaternius-monster-bee",
  "quaternius-monster-cactus", "quaternius-monster-chicken", "quaternius-monster-crab", "quaternius-monster-cthulhu",
  "quaternius-monster-cyclops", "quaternius-monster-deer", "quaternius-monster-demon", "quaternius-monster-ghost",
  "quaternius-monster-green-demon", "quaternius-monster-mushroom", "quaternius-monster-panda", "quaternius-monster-penguin",
  "quaternius-monster-pig", "quaternius-monster-skull", "quaternius-monster-tree", "quaternius-monster-yellow-dragon",
  "quaternius-monster-yeti",
  "gobkit-pet-minion-a01", "gobkit-pet-minion-a02", "gobkit-pet-minion-b01", "gobkit-pet-minion-b02",
  "gobkit-pet-minion-c01", "gobkit-pet-minion-c02", "gobkit-pet-minion-d01", "gobkit-pet-minion-d02",
  "gobkit-pet-animal-anglerfish", "gobkit-pet-animal-bat", "gobkit-pet-animal-corgi", "gobkit-pet-animal-duck",
  "gobkit-pet-animal-hippo", "gobkit-pet-animal-jellyfish", "gobkit-pet-animal-platypus", "gobkit-pet-animal-red",
  "gobkit-pet-animal-rhino", "gobkit-pet-animal-shark", "gobkit-pet-animalb-bee", "gobkit-pet-animalb-blue",
  "gobkit-pet-animalb-boar", "gobkit-pet-animalb-fugu", "gobkit-pet-animalb-goat", "gobkit-pet-animalb-marmot",
  "gobkit-pet-animalb-owl", "gobkit-pet-animalb-rat", "gobkit-pet-animalb-seal", "gobkit-pet-animalb-whale",
  "gobkit-pet-dino-ankylosaurus", "gobkit-pet-dino-carnotaurus", "gobkit-pet-dino-oviraptor", "gobkit-pet-dino-pachycephalosaurus",
  "gobkit-pet-dino-plesiosaurus", "gobkit-pet-dino-pterodactylus", "gobkit-pet-dino-spinosaurus", "gobkit-pet-dino-stegosaurus",
  "gobkit-pet-dino-trex", "gobkit-pet-dino-triceratops", "gobkit-pet-bird-eagle", "gobkit-pet-bird-flamingo",
  "gobkit-pet-bird-hummingbird", "gobkit-pet-bird-kiwi", "gobkit-pet-bird-macaw", "gobkit-pet-bird-peacock",
  "gobkit-pet-bird-pelican", "gobkit-pet-bird-penguin", "gobkit-pet-bird-rooster", "gobkit-pet-bird-toucan",
  "gobkit-pet-farm-blacksheep", "gobkit-pet-farm-bull", "gobkit-pet-farm-calf", "gobkit-pet-farm-highlandcow",
  "gobkit-pet-farm-holsteincow", "gobkit-pet-farm-lamb", "gobkit-pet-farm-pig", "gobkit-pet-farm-piglet",
  "gobkit-pet-farm-sheep", "gobkit-pet-farm-spottedpig", "gobkit-pet-animal006-bluetang", "gobkit-pet-animal006-doe",
  "gobkit-pet-animal006-elephant", "gobkit-pet-animal006-fox", "gobkit-pet-animal006-goose", "gobkit-pet-animal006-hare",
  "gobkit-pet-animal006-hedgehog", "gobkit-pet-animal006-lion", "gobkit-pet-animal006-squirrel", "gobkit-pet-animal006-zebra",
] as const;

export const KENNEY_BLASTER_IDS = [
  "blaster-a", "blaster-b", "blaster-c", "blaster-d", "blaster-e", "blaster-f",
  "blaster-g", "blaster-h", "blaster-i", "blaster-j", "blaster-k", "blaster-l",
  "blaster-m", "blaster-n", "blaster-o", "blaster-p", "blaster-q", "blaster-r",
] as const;
export type KenneyBlasterId = (typeof KENNEY_BLASTER_IDS)[number];
export type KenneyPetId = typeof KENNEY_PET_IDS[number];

export const KENNEY_VEHICLE_IDS = [
  "vehicle-speedster", "vehicle-racer", "vehicle-suv", "vehicle-monster-truck", "vehicle-truck",
  "car-sedan", "car-hatchback-sports", "car-taxi", "car-kart-oopi",
] as const;
export type KenneyVehicleId = typeof KENNEY_VEHICLE_IDS[number];

/** Parked vehicles on the shared campus, using centered world coordinates. */
export const INTERACTABLE_VEHICLE_PROPS = [
  { id: "campus-car-speedster", vehicleId: "vehicle-speedster", x: -4.5, z: -4.5, rotation: 0 },
  { id: "campus-car-racer", vehicleId: "vehicle-racer", x: 4.5, z: -4.5, rotation: 0 },
  { id: "campus-car-suv", vehicleId: "vehicle-suv", x: -4.5, z: 4.5, rotation: Math.PI },
  { id: "campus-car-taxi", vehicleId: "car-taxi", x: 4.5, z: 4.5, rotation: Math.PI },
  { id: "campus-car-monster-truck", vehicleId: "vehicle-monster-truck", x: -10, z: -10, rotation: 0 },
  { id: "campus-car-truck", vehicleId: "vehicle-truck", x: 0, z: -10, rotation: 0 },
  { id: "campus-car-sedan", vehicleId: "car-sedan", x: 10, z: -10, rotation: 0 },
  { id: "campus-car-sports-hatchback", vehicleId: "car-hatchback-sports", x: -10, z: 0, rotation: Math.PI },
  { id: "campus-car-kart", vehicleId: "car-kart-oopi", x: 10, z: 0, rotation: Math.PI },
] as const satisfies ReadonlyArray<{ id: string; vehicleId: KenneyVehicleId; x: number; z: number; rotation: number }>;
