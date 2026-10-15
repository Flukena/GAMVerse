import { useId, useState } from "react";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { useWorkspaceTheme } from "./useWorkspaceTheme";
import { parseWorkspaceTheme } from "./workspaceTheme";

interface OfficeMainMenuProps {
  offices: readonly { id: string; name: string }[];
  currentOfficeId: string;
  onSwitchOffice(id: string): void;
  onOpenChange?(open: boolean): void;
}

export function OfficeMainMenu({ offices, currentOfficeId, onSwitchOffice, onOpenChange }: OfficeMainMenuProps) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useWorkspaceTheme();
  const titleId = useId();
  const dialogId = useId();
  const changeOpen = (next: boolean) => { setOpen(next); onOpenChange?.(next); };
  return <>
    <button type="button" className="office-rail-brand office-main-menu-trigger" aria-label="Open main menu"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} onClick={() => changeOpen(true)}>G</button>
    {open && <WorkspaceDialog labelledBy={titleId} onClose={() => changeOpen(false)}>
      <section id={dialogId} className="office-main-menu">
        <header><h2 id={titleId}>Main menu</h2><button type="button" aria-label="Close main menu" onClick={() => changeOpen(false)}>×</button></header>
        <h3>Your offices</h3>
        <div className="office-switcher-list" aria-label="Switch office">
          {offices.length === 0 && <p>No offices available.</p>}
          {offices.map(office => <button type="button" key={office.id} aria-current={office.id === currentOfficeId ? "location" : undefined}
            onClick={() => { changeOpen(false); if (office.id !== currentOfficeId) onSwitchOffice(office.id); }}>
            <span>{office.name}</span>{office.id === currentOfficeId && <small>Current office</small>}
          </button>)}
        </div>
        <label className="workspace-theme-control">Appearance
          <select value={theme} onChange={event => setTheme(parseWorkspaceTheme(event.target.value))}>
            <option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option>
          </select>
        </label>
      </section>
    </WorkspaceDialog>}
  </>;
}
