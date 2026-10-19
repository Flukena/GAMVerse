import { customStatusLabel } from "./AvailabilityPresentation";
import { personPresenceLabel, type DirectoryEntry } from "./peopleDirectory";
import { buildPersonActions, runPersonAction, type PersonActionCallbacks, type PersonActionContext } from "./personActions";
import { PersonAvatar } from "./PersonAvatar";
import "./PeoplePanel.css";

const RECONNECTING_NOTICE = "Live actions will return when this person reconnects. You can still send a message.";
const OFFLINE_NOTICE = "This person is offline. You can still send a message.";
export type PersonCardProps = PersonActionContext & PersonActionCallbacks & { entry: DirectoryEntry; id?: string };

export function PersonCard(props: PersonCardProps) {
  const person = props.entry[1];
  const customStatus = customStatusLabel(person);
  const actions = buildPersonActions(props.entry, props);
  const meetDisabledReason = actions.find(action => action.id === "meet")?.disabledReason;
  return <div id={props.id} className="directory-person-details" aria-label={`Profile for ${person.displayName || person.username}`}>
    <PersonAvatar person={person} />
    <strong>{person.displayName || person.username}</strong>
    <span className="directory-username">@{person.username} · {personPresenceLabel(person)}</span>
    {customStatus && <p className="directory-custom-status">{customStatus}</p>}
    <div className="directory-actions">{actions.map((action) => <button key={action.id} type="button" disabled={action.disabled}
      title={action.disabledReason} aria-pressed={action.pressed} onClick={() => runPersonAction(action, props.entry, props)}>{action.label}</button>)}</div>
    {meetDisabledReason && <p className="directory-notice">{meetDisabledReason}</p>}
    {person.presence !== "online" && <p className="directory-notice">{person.presence === "offline" ? OFFLINE_NOTICE : RECONNECTING_NOTICE}</p>}
  </div>;
}
