const BLOCKY_PREFIX = "character-blocky-";
const MINI_CHARACTER_ID = /^character-(?:male|female)-[a-z]$/;
const BLOCKY_CHARACTER_ID = /^character-blocky-[a-z]$/;

export function characterPortraitPreviewUrl(characterId: string): string | null {
  if (BLOCKY_CHARACTER_ID.test(characterId)) {
    return `/assets/kenney/blocky-characters/Previews/character-${characterId.slice(BLOCKY_PREFIX.length)}.png`;
  }
  return MINI_CHARACTER_ID.test(characterId)
    ? `/assets/kenney/mini-characters/Previews/${characterId}.png`
    : null;
}
