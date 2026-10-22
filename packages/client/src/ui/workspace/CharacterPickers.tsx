import { KENNEY_CHARACTER_IDS, type KenneyCharacterId } from "@gammyverse/shared";
import { characterDetails, type CharacterSelectionId, type PersonalAvatarModel } from "./characterPresentation";

const CHARACTER_PLACEHOLDER_TONE_COUNT = 6;

export function CharacterPicker({ value, currentCharacterId, onChange }: { value: CharacterSelectionId | null; currentCharacterId: CharacterSelectionId | null; onChange: (id: KenneyCharacterId) => void }) {
  return <div className="character-picker" role="radiogroup" aria-label="Choose a character">
    {KENNEY_CHARACTER_IDS.map((id, index) => {
      const { label, preview } = characterDetails(id, []);
      return <button type="button" className={`character-option${value === id ? " selected" : ""}`} key={id} role="radio" aria-checked={value === id} onClick={() => onChange(id)}>
        {preview ? <img src={preview} alt="" loading="lazy" /> : <span className={`character-option-avatar-placeholder tone-${index % CHARACTER_PLACEHOLDER_TONE_COUNT}`} aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="19" r="12" /><path d="M13 58c1-14 8-23 19-23s18 9 19 23H13Z" /></svg></span>}
        <span>{label}</span>
        {currentCharacterId === id && <small className="character-current-badge">Current</small>}
      </button>;
    })}
  </div>;
}

export function PersonalAvatarPicker({ models, value, currentCharacterId, onChange, onRemove }: { models: PersonalAvatarModel[]; value: CharacterSelectionId | null; currentCharacterId: CharacterSelectionId | null; onChange: (id: PersonalAvatarModel["id"]) => void; onRemove: (model: PersonalAvatarModel) => void }) {
  if (models.length === 0) return null;
  return <div className="character-picker" role="radiogroup" aria-label="Your uploaded characters">
    {models.map((model) => <div className={`character-option personal-avatar-option${value === model.id ? " selected" : ""}`} key={model.id}>
      <button type="button" className="personal-avatar-select" role="radio" aria-checked={value === model.id} aria-label={`Use ${model.label}`} onClick={() => onChange(model.id)}>
        <span className="personal-avatar-preview" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M13 10h22v8h5v12h-5v8H13v-8H8V18h5v-8Z" fill="currentColor" opacity=".18"/><path d="M17 15h14v18H17zM11 21h6v8h-6zm20 0h6v8h-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M20 22h2m4 0h2M20 28h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></span>
        <span>{model.label}</span>
      </button>
      {currentCharacterId === model.id && <small className="character-current-badge">Current</small>}
      <button type="button" className="personal-avatar-remove" aria-label={`Remove ${model.label}`} title={value === model.id || currentCharacterId === model.id ? "Choose and save another character before removing this model" : `Remove ${model.label}`} disabled={value === model.id || currentCharacterId === model.id} onClick={() => onRemove(model)}>×</button>
    </div>)}
  </div>;
}
