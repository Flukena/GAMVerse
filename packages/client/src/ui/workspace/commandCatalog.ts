import type { WorkspaceCommand } from "./commandSearch";

const PERSON_UNAVAILABLE_LABEL = "This person is reconnecting.";
const LOCATE_LABEL = "Locate";
const GO_TO_LABEL = "Go to";
const ACCOUNT_LABEL = "Account";
const PANEL_COMMANDS = [
  { id: "people", label: "People" },
  { id: "chat", label: "Chat" },
  { id: "office", label: "Office" },
  { id: "activity", label: "Activity" },
] as const;

export type CommandCatalogPerson = {
  sessionId: string;
  username: string;
  displayName?: string;
  presence: string;
};
export type CommandCatalogRoom = { id: string; name: string; kind?: string };
export type CommandCatalog = {
  people: readonly CommandCatalogPerson[];
  rooms: readonly CommandCatalogRoom[];
  disabledReason?: string;
};

function personCommands(person: CommandCatalogPerson, disabledReason?: string): WorkspaceCommand[] {
  const name = person.displayName || person.username;
  const reason = disabledReason || (person.presence === "online" ? undefined : PERSON_UNAVAILABLE_LABEL);
  const base = { kind: "person", targetId: person.sessionId, detail: `@${person.username}`, disabledReason: reason } as const;
  return [
    { ...base, id: `locate-person:${person.sessionId}`, intent: "locate-person", label: `${LOCATE_LABEL} ${name}`, keywords: [name, person.username] },
    { ...base, id: `go-to-person:${person.sessionId}`, intent: "go-to-person", label: `${GO_TO_LABEL} ${name}`, keywords: [name, person.username] },
  ];
}

export function buildCommandCatalog({ people, rooms, disabledReason }: CommandCatalog): WorkspaceCommand[] {
  return [
    ...people.flatMap((person) => personCommands(person, disabledReason)),
    ...rooms.map((room): WorkspaceCommand => ({
      id: `go-to-room:${room.id}`, kind: "room", intent: "go-to-room", targetId: room.id,
      label: `${GO_TO_LABEL} ${room.name}`, detail: room.kind, disabledReason,
    })),
    ...PANEL_COMMANDS.map((panel): WorkspaceCommand => ({
      id: `open-panel:${panel.id}`, kind: "action", intent: "open-panel", targetId: panel.id, label: panel.label,
    })),
    { id: "account", kind: "action", intent: "account", label: ACCOUNT_LABEL },
  ];
}
