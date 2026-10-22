import type { KenneyCharacterId } from "@gammyverse/shared";
import { kaykitCharacter, polygonalMindCharacter, QUATERNIUS_CHARACTERS } from "../../assets/characterAssets";

export type CharacterSelectionId = KenneyCharacterId | `custom-${string}`;
export type PersonalAvatarModel = { id: `custom-${string}`; label: string; modelUrl: string };

type CharacterDetails = { label: string; source: string; preview: string | null };

const CUSTOM_CHARACTER_PREFIX = "custom-";
const BLOCKY_CHARACTER_PREFIX = "character-blocky-";
const MINI_CHARACTER_PREFIX = "character-";
const UPLOADED_MODEL_LABEL = "Uploaded model";
const UPLOADED_MODEL_SOURCE = "Your uploaded model";
const BLOCKY_CHARACTER_SOURCE = "Kenney Blocky Characters";
const MINI_CHARACTER_SOURCE = "Kenney Mini Characters";

function kenneyCharacterDetails(characterId: KenneyCharacterId): CharacterDetails {
  const blocky = characterId.startsWith(BLOCKY_CHARACTER_PREFIX);
  const suffix = blocky ? characterId.slice(BLOCKY_CHARACTER_PREFIX.length) : characterId.replace(MINI_CHARACTER_PREFIX, "");
  return {
    label: blocky ? `Blocky ${suffix.toUpperCase()}` : suffix.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    source: blocky ? BLOCKY_CHARACTER_SOURCE : MINI_CHARACTER_SOURCE,
    preview: blocky ? `/assets/kenney/blocky-characters/Previews/character-${suffix}.png` : `/assets/kenney/mini-characters/Previews/${characterId}.png`,
  };
}

export function characterDetails(characterId: CharacterSelectionId, models: PersonalAvatarModel[]): CharacterDetails {
  if (characterId.startsWith(CUSTOM_CHARACTER_PREFIX)) {
    const customModel = models.find((model) => model.id === characterId);
    return { label: customModel?.label ?? UPLOADED_MODEL_LABEL, source: UPLOADED_MODEL_SOURCE, preview: null };
  }
  const builtInId = characterId as KenneyCharacterId;
  const supplied = QUATERNIUS_CHARACTERS[builtInId as keyof typeof QUATERNIUS_CHARACTERS]
    ?? polygonalMindCharacter(builtInId)
    ?? kaykitCharacter(builtInId);
  if (supplied) return { label: supplied.label, source: supplied.source, preview: supplied.preview };
  return kenneyCharacterDetails(builtInId);
}
