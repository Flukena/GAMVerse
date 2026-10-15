import { customStatusLabel } from "./AvailabilityPresentation";
import { useEffect, useId, useRef, useState } from "react";
import { buildPeopleDirectory, mergeOfficeDirectory, personPresenceLabel, type DirectoryEntry } from "./peopleDirectory";
import { PersonAvatar } from "./PersonAvatar";
import { PersonCard } from "./PersonCard";
import type { PersonActionCallbacks, PersonActionContext } from "./personActions";
import { useOfficeDirectory } from "./useOfficeDirectory";
import "./PeoplePanel.css";

const SEARCH_LABEL = "Search people";
const PEOPLE_PANEL_LABEL = "People in the office";
const HAND_RAISED_LABEL = "Hand raised";
const SELF_LABEL = "You";
const REFRESHING_MEMBERS_LABEL = "Refreshing members…";
export type PeoplePanelProps = PersonActionContext & PersonActionCallbacks & {
  people: readonly DirectoryEntry[];
  emptyMessage: string;
  directoryEndpoint?: string;
  officeId?: string | null;
  directoryRefreshKey?: string;
  selectedUsername?: string | null;
  onSelectionChange?: (username: string | null) => void;
};

type PersonRowProps = { entry: DirectoryEntry; selected: boolean; onSelect: () => void; panel: PeoplePanelProps };

function PersonRow({ entry, selected, onSelect, panel }: PersonRowProps) {
  const [sessionId, person] = entry;
  const customStatus = customStatusLabel(person);
  const detailsId = useId();
  const summaryRef = useRef<HTMLButtonElement>(null);
  const isSelf = sessionId === panel.localSessionId || person.username === panel.localUsername;
  const name = person.displayName || person.username;
  const canExpand = !isSelf || panel.canSpotlight;
  return <li className={`directory-person${selected ? " is-selected" : ""}`} onKeyDown={(event) => {
    if (event.key !== "Escape" || !selected) return;
    event.stopPropagation();
    onSelect();
    summaryRef.current?.focus();
  }}>
    <button ref={summaryRef} className="directory-person-summary" type="button" onClick={onSelect} disabled={!canExpand}
      aria-expanded={canExpand ? selected : undefined} aria-controls={canExpand ? detailsId : undefined}>
      <PersonAvatar person={person} />
      <span className="directory-person-copy"><strong>{isSelf ? `${name} (${SELF_LABEL})` : name}{person.handRaised && <span aria-label={HAND_RAISED_LABEL}> ✋</span>}</strong><small>{personPresenceLabel(person)}</small>{customStatus && <small className="directory-custom-status">{customStatus}</small>}</span>
      {canExpand && <span className="directory-expand" aria-hidden="true">{selected ? "−" : "+"}</span>}
    </button>
    {selected && canExpand && <PersonCard {...panel} entry={entry} id={detailsId} />}
  </li>;
}

export function PeoplePanel(props: PeoplePanelProps) {
  const [query, setQuery] = useState("");
  const [internalSelection, setInternalSelection] = useState<string | null>(null);
  const directory = useOfficeDirectory(props.directoryEndpoint, props.officeId, props.directoryRefreshKey);
  const people = directory.members === null ? props.people : mergeOfficeDirectory(props.people, directory.members);
  const selectedUsername = props.selectedUsername === undefined ? internalSelection : props.selectedUsername;
  const select = (username: string | null) => { setInternalSelection(username); props.onSelectionChange?.(username); };
  const selectionExists = people.some(([, person]) => person.username === selectedUsername);
  useEffect(() => {
    if (selectedUsername !== null && !selectionExists) { setInternalSelection(null); props.onSelectionChange?.(null); }
  }, [selectedUsername, selectionExists, props.onSelectionChange]);
  const groups = buildPeopleDirectory(people, props.localSessionId, query);
  return <section id="people-panel" className="directory-panel" aria-label={PEOPLE_PANEL_LABEL} onKeyDown={(event) => {
    if (event.key === "Escape" && selectedUsername !== null) { event.stopPropagation(); select(null); }
  }}>
    <label className="directory-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={SEARCH_LABEL} aria-label={SEARCH_LABEL} /></label>
    {directory.error && <p className="directory-notice" role="status">{directory.error}</p>}
    {directory.loading && <p className="directory-notice" role="status">{REFRESHING_MEMBERS_LABEL}</p>}
    {groups.length === 0 && <p className="directory-empty" role="status">{people.length === 0 ? props.emptyMessage : `No people match “${query.trim()}”.`}</p>}
    {groups.map((group) => <section className="directory-group" key={group.id} aria-label={group.label}>
      <h3>{group.label}<span>{group.people.length}</span></h3>
      <ul>{group.people.map((entry) => <PersonRow key={entry[0]} entry={entry} selected={selectionExists && selectedUsername === entry[1].username}
        onSelect={() => select(selectedUsername === entry[1].username ? null : entry[1].username)} panel={props} />)}</ul>
    </section>)}
  </section>;
}
