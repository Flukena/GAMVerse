import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { nextCommandId, resolveCommand, searchCommands, type WorkspaceCommand } from "./commandSearch";
import "./CommandPalette.css";

const COMMAND_PALETTE_LABEL = "Search people, rooms and actions";
const SEARCH_PLACEHOLDER_LABEL = "Search people, rooms, actions…";
const CLOSE_LABEL = "Close command search";
const NO_RESULTS_LABEL = "No matching people, rooms or actions.";
const KEYBOARD_HELP_LABEL = "Use ↑ and ↓ to choose, Enter to open, Escape to close.";
const RESULT_KIND_LABELS = { person: "Person", room: "Room", action: "Action" } as const;

export type CommandPaletteProps = {
  commands: readonly WorkspaceCommand[];
  open: boolean;
  onClose: () => void;
  onExecute: (command: WorkspaceCommand) => void;
  disabledReason?: string;
};

export function CommandPalette({ open, ...props }: CommandPaletteProps) {
  if (!open) return null;
  return <CommandPaletteDialog {...props} />;
}

function CommandPaletteDialog({ commands, onClose, onExecute, disabledReason }: Omit<CommandPaletteProps, "open">) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const titleId = useId();
  const listId = useId();
  const helpId = useId();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const results = searchCommands(commands, query);
  const activeId = selectedId === undefined ? results[0]?.id ?? null : selectedId;
  const activeIndex = results.findIndex((command) => command.id === activeId);
  const latest = useRef({ commands, disabledReason, onExecute });
  latest.current = { commands, disabledReason, onExecute };
  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function execute(id: string | null) {
    const current = latest.current;
    const command = resolveCommand(current.commands, id, current.disabledReason);
    if (!command) return;
    onClose();
    current.onExecute(command);
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Enter") {
      event.preventDefault();
      execute(activeIndex < 0 ? null : activeId);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedId(nextCommandId(results, activeId, event.key === "ArrowDown" ? 1 : -1));
    }
  }

  return <WorkspaceDialog labelledBy={titleId} onClose={onClose} className="command-palette" initialFocusRef={inputRef}>
    <div className="command-palette-heading"><h2 id={titleId}>{COMMAND_PALETTE_LABEL}</h2><button type="button" aria-label={CLOSE_LABEL} onClick={onClose}>×</button></div>
    <input ref={inputRef} type="search" role="combobox" aria-label={COMMAND_PALETTE_LABEL} placeholder={SEARCH_PLACEHOLDER_LABEL}
      aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-describedby={helpId}
      aria-activedescendant={activeIndex < 0 ? undefined : `${listId}-${activeIndex}`}
      value={query} onKeyDown={navigate} onChange={(event) => { setQuery(event.target.value); setSelectedId(undefined); }} />
    <p id={helpId} className="command-palette-help">{KEYBOARD_HELP_LABEL}</p>
    {disabledReason && <p className="command-palette-notice" role="status">{disabledReason}</p>}
    <ul ref={listRef} id={listId} role="listbox" aria-label={COMMAND_PALETTE_LABEL}>
      {results.map((command, index) => {
        const reason = disabledReason || command.disabledReason;
        return <li id={`${listId}-${index}`} key={command.id} role="option" aria-selected={command.id === activeId}
          aria-disabled={Boolean(reason)} className={command.id === activeId ? "is-active" : undefined}>
          <button type="button" tabIndex={-1} aria-disabled={Boolean(reason)} onMouseDown={(event) => event.preventDefault()}
            onClick={() => execute(command.id)} onMouseEnter={() => setSelectedId(command.id)}>
            <span className="command-palette-kind">{RESULT_KIND_LABELS[command.kind]}</span>
            <span className="command-palette-copy"><strong>{command.label}</strong>{command.detail && <small>{command.detail}</small>}{reason && <small className="command-palette-notice">{reason}</small>}</span>
          </button>
        </li>;
      })}
    </ul>
    {results.length === 0 && <p role="status" className="command-palette-empty">{NO_RESULTS_LABEL}</p>}
  </WorkspaceDialog>;
}
