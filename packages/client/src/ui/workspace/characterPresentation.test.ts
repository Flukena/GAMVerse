import assert from "node:assert/strict";
import test from "node:test";
import { characterDetails, type PersonalAvatarModel } from "./characterPresentation";

test("Kenney mini and blocky characters retain their labels and preview paths", () => {
  assert.deepEqual(characterDetails("character-female-a", []), {
    label: "Female A", source: "Kenney Mini Characters", preview: "/assets/kenney/mini-characters/Previews/character-female-a.png",
  });
  assert.deepEqual(characterDetails("character-blocky-a", []), {
    label: "Blocky A", source: "Kenney Blocky Characters", preview: "/assets/kenney/blocky-characters/Previews/character-a.png",
  });
});

test("external character packs retain their supplied names, attribution and previews", () => {
  const cases = [
    ["character-zombie-matt", "Matt · Survivor", "Quaternius Zombie Apocalypse Kit", "/assets/quaternius/zombie-apocalypse-kit/Preview_AllModels.jpg"],
    ["character-pm-jimmy", "Jimmy", "Polygonal Mind 100 Avatars · CC0", "/assets/external/characters/polygonal-mind-100-avatars/character-pm-jimmy.png"],
    ["character-kaykit-rogue-hooded", "Rogue · Hooded", "KayKit Adventurers · CC0", "/assets/external/characters/kaykit-adventurers/Rogue_Hooded.png"],
  ] as const;
  for (const [id, label, source, preview] of cases) {
    const details = characterDetails(id, []);
    assert.equal(details.label, label);
    assert.equal(details.source, source);
    assert.equal(details.preview, preview);
  }
});

test("uploaded characters use their saved names and keep the missing-model fallback", () => {
  const models: PersonalAvatarModel[] = [{ id: "custom-test", label: "My avatar", modelUrl: "/models/test.glb" }];
  assert.deepEqual(characterDetails("custom-test", models), { label: "My avatar", source: "Your uploaded model", preview: null });
  assert.deepEqual(characterDetails("custom-missing", models), { label: "Uploaded model", source: "Your uploaded model", preview: null });
});
