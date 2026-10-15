const PREFERENCES_LABEL = "PREFERENCES";
const GENERAL_LABEL = "General";
const GENERAL_INTRO_LABEL = "Adjust client-side preferences.";
const IDLE_ANIMATIONS_LABEL = "Idle animations";
const IDLE_ANIMATIONS_DESCRIPTION_LABEL = "Turn off idle movement for characters and pets";
const CONVERSATIONS_ACCESSIBLE_LABEL = "Conversations and meeting invitations";
const CONVERSATIONS_LABEL = "Talk · Conversations";
const CONVERSATIONS_DESCRIPTION_LABEL = "Conversation participation and meeting invitations";
const DEVICES_LABEL = "Audio and video settings";
const DEVICES_DESCRIPTION_LABEL = "Choose and test your microphone, camera, and speakers";

interface OfficeGeneralSettingsProps {
  idleAnimationsEnabled: boolean;
  onIdleAnimationsChange(enabled: boolean): void;
  onConversations(): void;
  onDevices(): void;
}

export function OfficeGeneralSettings(props: Readonly<OfficeGeneralSettingsProps>) {
  return <section aria-labelledby="general-settings-title">
    <span className="eyebrow">{PREFERENCES_LABEL}</span>
    <h3 id="general-settings-title">{GENERAL_LABEL}</h3>
    <p className="settings-intro">{GENERAL_INTRO_LABEL}</p>
    <button type="button" className="settings-menu-row" aria-label={CONVERSATIONS_ACCESSIBLE_LABEL} onClick={props.onConversations}>
      <span><strong>{CONVERSATIONS_LABEL}</strong><small>{CONVERSATIONS_DESCRIPTION_LABEL}</small></span><span aria-hidden="true">›</span>
    </button>
    <button type="button" className="settings-menu-row" aria-label={DEVICES_LABEL} onClick={props.onDevices}>
      <span><strong>{DEVICES_LABEL}</strong><small>{DEVICES_DESCRIPTION_LABEL}</small></span><span aria-hidden="true">›</span>
    </button>
    <div className="permission-row settings-general-row">
      <div><strong>{IDLE_ANIMATIONS_LABEL}</strong><small>{IDLE_ANIMATIONS_DESCRIPTION_LABEL}</small></div>
      <label className="settings-toggle-control"><span className="sr-only">{IDLE_ANIMATIONS_LABEL}</span>
        <input type="checkbox" role="switch" checked={props.idleAnimationsEnabled} onChange={event => props.onIdleAnimationsChange(event.target.checked)} /><span aria-hidden="true" />
      </label>
    </div>
  </section>;
}
