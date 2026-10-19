import { useEffect, useState } from "react";
import { OfficeHeader, OfficeNavigation, type OfficePanel } from "./OfficeNavigation";
import { OfficeMainMenu } from "./OfficeMainMenu";
import { CommandPalette } from "./CommandPalette";
import { useCommandPalette } from "./commandPaletteState";
import { buildCommandCatalog, type CommandCatalogPerson, type CommandCatalogRoom } from "./commandCatalog";
import type { WorkspaceCommand } from "./commandSearch";

type WorkspaceChromeProps = {
  officeId: string;
  offices: readonly { id: string; name: string }[];
  username: string;
  onlineCount: number;
  people: readonly CommandCatalogPerson[];
  rooms: readonly CommandCatalogRoom[];
  panel: OfficePanel;
  panelOpen: boolean;
  unread: number;
  accountOpen: boolean;
  navigationDisabled: boolean;
  onSelectPanel(panel: OfficePanel): void;
  onOpenPanel(panel: OfficePanel): void;
  onAccount(): void;
  onSwitchOffice(id: string): void;
  onInputBlocked(blocked: boolean): void;
  onLocate(sessionId: string): void;
  onGoTo(sessionId: string): void;
  onGoToRoom(zoneId: string): void;
};

const LIVE_ACTIONS_UNAVAILABLE_LABEL = "Navigation is unavailable while reconnecting, paused, or editing.";
const COMMAND_PANELS: Readonly<Record<string, OfficePanel>> = { office: "workspace", people: "people", chat: "chat", activity: "activity" };

function executeWorkspaceCommand(command: WorkspaceCommand, props: WorkspaceChromeProps) {
  const targetId = command.targetId;
  if (command.intent === "account") { props.onAccount(); return; }
  if (!targetId) return;
  const actions: Record<string, () => void> = {
    "locate-person": () => props.onLocate(targetId),
    "go-to-person": () => props.onGoTo(targetId),
    "go-to-room": () => props.onGoToRoom(targetId),
    "open-panel": () => { const panel = COMMAND_PANELS[targetId]; if (panel) props.onOpenPanel(panel); },
  };
  if (command.intent) actions[command.intent]?.();
}

export function WorkspaceChrome(props: WorkspaceChromeProps) {
  const palette = useCommandPalette();
  const [menuOpen, setMenuOpen] = useState(false);
  const blocked = menuOpen || palette.open;
  useEffect(() => { props.onInputBlocked(blocked); }, [blocked, props.onInputBlocked]);
  const commands = buildCommandCatalog({ people: props.people, rooms: props.rooms,
    disabledReason: props.navigationDisabled ? LIVE_ACTIONS_UNAVAILABLE_LABEL : undefined });
  return <>
    <OfficeNavigation panel={props.panel} open={props.panelOpen} unread={props.unread} onSelect={props.onSelectPanel}
      mainMenu={<OfficeMainMenu offices={props.offices} currentOfficeId={props.officeId} onSwitchOffice={props.onSwitchOffice} onOpenChange={setMenuOpen} />} />
    <OfficeHeader username={props.username} onlineCount={props.onlineCount} accountOpen={props.accountOpen} onAccount={props.onAccount} />
    <CommandPalette commands={commands} open={palette.open} onClose={palette.closePalette} onExecute={command => executeWorkspaceCommand(command, props)} />
  </>;
}
