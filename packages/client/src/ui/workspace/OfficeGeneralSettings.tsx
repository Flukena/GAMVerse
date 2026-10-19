const PREFERENCES_LABEL = "PREFERENCES";
const GENERAL_LABEL = "General";
const GENERAL_INTRO_LABEL = "Adjust client-side preferences.";
const IDLE_ANIMATIONS_LABEL = "Idle animations";
const IDLE_ANIMATIONS_DESCRIPTION_LABEL = "Turn off idle movement for characters and pets";
interface OfficeGeneralSettingsProps {
  idleAnimationsEnabled: boolean;
  onIdleAnimationsChange(enabled: boolean): void;
}

export function OfficeGeneralSettings(props: Readonly<OfficeGeneralSettingsProps>) {
  return <section aria-labelledby="general-settings-title">
    <span className="eyebrow">{PREFERENCES_LABEL}</span>
    <h3 id="general-settings-title">{GENERAL_LABEL}</h3>
    <p className="settings-intro">{GENERAL_INTRO_LABEL}</p>
    <div className="permission-row settings-general-row">
      <div><strong>{IDLE_ANIMATIONS_LABEL}</strong><small>{IDLE_ANIMATIONS_DESCRIPTION_LABEL}</small></div>
      <label className="settings-toggle-control"><span className="sr-only">{IDLE_ANIMATIONS_LABEL}</span>
        <input type="checkbox" role="switch" checked={props.idleAnimationsEnabled} onChange={event => props.onIdleAnimationsChange(event.target.checked)} /><span aria-hidden="true" />
      </label>
    </div>
  </section>;
}
