export type WorkspaceCommandKind = "person" | "room" | "action";

export type WorkspaceCommand = {
  id: string;
  targetId?: string;
  intent?: "locate-person" | "go-to-person" | "go-to-room" | "open-panel" | "account";
  kind: WorkspaceCommandKind;
  label: string;
  detail?: string;
  keywords?: readonly string[];
  disabledReason?: string;
};

const EXACT_LABEL_RANK = 0;
const PREFIX_LABEL_RANK = 1;
const OTHER_MATCH_RANK = 2;
const MISSING_COMMAND_INDEX = -1;

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

function commandRank(command: WorkspaceCommand, query: string) {
  const label = normalizeSearch(command.label);
  if (label === query) return EXACT_LABEL_RANK;
  return label.startsWith(query) ? PREFIX_LABEL_RANK : OTHER_MATCH_RANK;
}

export function searchCommands(commands: readonly WorkspaceCommand[], query: string): WorkspaceCommand[] {
  const normalized = normalizeSearch(query);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return commands.filter((command) => {
    const searchable = normalizeSearch([command.label, command.detail, ...(command.keywords ?? [])].join(" "));
    return tokens.every((token) => searchable.includes(token));
  }).sort((left, right) => commandRank(left, normalized) - commandRank(right, normalized));
}

export function resolveCommand(commands: readonly WorkspaceCommand[], id: string | null, disabledReason?: string) {
  if (disabledReason) return null;
  return commands.find((command) => command.id === id && !command.disabledReason) ?? null;
}

export function nextCommandId(commands: readonly WorkspaceCommand[], currentId: string | null, direction: -1 | 1) {
  if (commands.length === 0) return null;
  const currentIndex = commands.findIndex((command) => command.id === currentId);
  if (currentIndex === MISSING_COMMAND_INDEX) return commands[direction > 0 ? 0 : commands.length - 1].id;
  return commands[(currentIndex + direction + commands.length) % commands.length].id;
}
