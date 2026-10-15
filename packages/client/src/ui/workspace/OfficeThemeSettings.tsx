import type { WorkspaceTheme } from "./workspaceTheme";

const THEME_CHOICES: readonly { id: WorkspaceTheme; label: string; description: string; colors: readonly string[] }[] = [
  { id: "app", label: "App", description: "Eucalyptus, oat and terracotta", colors: ["#DCE8DE", "#E7EEE7", "#293A32", "#B86F53"] },
  { id: "light", label: "Light", description: "Oat, warm stone and clay", colors: ["#E7DFD1", "#EEE6D9", "#3C362E", "#A9634E"] },
  { id: "dark", label: "Dark", description: "Deep eucalyptus and apricot clay", colors: ["#202B28", "#303D37", "#ECE4D5", "#D79A78"] },
  { id: "system", label: "System", description: "Follow your device appearance", colors: ["#DCE8DE", "#E7EEE7", "#293A32", "#B86F53"] },
];

interface OfficeThemeSettingsProps {
  theme: WorkspaceTheme;
  onThemeChange(theme: WorkspaceTheme): void;
}

export function OfficeThemeSettings({ theme, onThemeChange }: Readonly<OfficeThemeSettingsProps>) {
  return <section aria-labelledby="theme-settings-title" className="office-theme-settings">
    <span className="eyebrow">APPEARANCE</span>
    <h3 id="theme-settings-title">Theme</h3>
    <p className="settings-intro">Choose the colors used across GAMVerse.</p>
    <div className="office-theme-choices" role="group" aria-label="Color theme">
      {THEME_CHOICES.map((choice) => <button key={choice.id} type="button" className={`office-theme-choice${theme === choice.id ? " is-selected" : ""}`} aria-pressed={theme === choice.id} onClick={() => onThemeChange(choice.id)}>
        <span className="office-theme-swatches" aria-hidden="true">{choice.colors.map((color) => <i key={color} style={{ backgroundColor: color }} />)}</span>
        <span className="office-theme-choice-copy"><strong>{choice.label}{choice.id === "app" ? " · Default" : ""}</strong><small>{choice.description}</small></span>
        <span className="office-theme-selected-mark" aria-hidden="true">{theme === choice.id ? "✓" : ""}</span>
      </button>)}
    </div>
  </section>;
}
