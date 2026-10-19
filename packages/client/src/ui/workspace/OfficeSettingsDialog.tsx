import { useId, type ReactNode } from "react";
import { WorkspaceDialog } from "./WorkspaceDialog";

const SETTINGS_LABEL = "Settings";
const USER_SETTINGS_LABEL = "USER SETTINGS";
const CLOSE_SETTINGS_LABEL = "Close settings";

interface OfficeSettingsDialogProps {
  children: ReactNode;
  onClose(): void;
}

export function OfficeSettingsDialog({ children, onClose }: Readonly<OfficeSettingsDialogProps>) {
  const titleId = useId();
  return <WorkspaceDialog labelledBy={titleId} onClose={onClose} className="profile-dialog settings-dialog">
    <header className="profile-dialog-header"><div><span className="eyebrow">{USER_SETTINGS_LABEL}</span><h2 id={titleId}>{SETTINGS_LABEL}</h2></div>
      <button type="button" className="icon-button" aria-label={CLOSE_SETTINGS_LABEL} onClick={onClose}>×</button></header>
    {children}
  </WorkspaceDialog>;
}
