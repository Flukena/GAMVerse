import type { ReactNode } from "react";
import "./OfficeNavigation.css";

export type OfficePanel = "workspace" | "people" | "chat" | "activity";

const PANEL_LABELS: Record<OfficePanel, string> = {
  workspace: "Office", people: "People", chat: "Chat", activity: "Activity",
};
const PANEL_ICONS: Record<OfficePanel, string> = {
  workspace: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1Z",
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l2-5a8.5 8.5 0 1 1 16-3.5ZM8 10h8M8 14h5",
  activity: "M3 12h4l3-8 4 16 3-8h4",
};
const PANEL_ORDER: readonly OfficePanel[] = ["workspace", "people", "chat", "activity"];
const MAX_BADGE_COUNT = 99;
const MAX_BADGE_LABEL = "99+";

interface NavigationProps {
  mainMenu?: ReactNode;
  panel: OfficePanel;
  open: boolean;
  unread: number;
  onSelect(panel: OfficePanel): void;
}

export function OfficeNavigation({ panel, open, unread, onSelect, mainMenu }: NavigationProps) {
  return <nav className="office-rail" aria-label="Office navigation" data-tutorial-target="office-navigation">
    {mainMenu ?? <span className="office-rail-brand" title="GAMVerse" aria-label="GAMVerse">G</span>}
    {PANEL_ORDER.map((item) => <button key={item} id={`office-nav-${item}`} type="button"
      className={`office-rail-item${open && panel === item ? " is-active" : ""}`}
      aria-label={item === "chat" && unread > 0 ? `Chat, ${unread} unread messages` : PANEL_LABELS[item]}
      aria-controls={open ? "office-sidebar" : undefined} aria-expanded={open && panel === item}
      onClick={() => onSelect(item)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={PANEL_ICONS[item]} /></svg>
      <span>{PANEL_LABELS[item]}</span>
      {item === "chat" && unread > 0 && <span className="office-rail-badge" aria-hidden="true">{unread > MAX_BADGE_COUNT ? MAX_BADGE_LABEL : unread}</span>}
    </button>)}
  </nav>;
}

interface HeaderProps {
  username: string;
  accountOpen: boolean;
  onAccount(): void;
}

export function OfficeHeader(props: HeaderProps) {
  return <header className="office-header">
    <div className="office-header-brand" aria-label="GAMVerse">GAMVerse</div>
    <div className="office-header-actions">
      <button type="button" className="office-account-button" aria-label="Account and settings" title="Account and settings" aria-expanded={props.accountOpen} aria-controls={props.accountOpen ? "character-drawer" : undefined} onClick={props.onAccount}>{props.username.slice(0, 1).toUpperCase()}</button>
    </div>
  </header>;
}

export function OfficePanelHeader({ panel }: { panel: OfficePanel }) {
  return <header className="office-panel-header">
    <h2 id="office-panel-title">{PANEL_LABELS[panel]}</h2>
  </header>;
}
