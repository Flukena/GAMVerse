import { customStatusLabel } from "./AvailabilityPresentation";
import { personPresenceLabel, type DirectoryEntry } from "./peopleDirectory";
import { buildPersonActions, runPersonAction, type PersonActionCallbacks, type PersonActionContext } from "./personActions";
import { PersonAvatar } from "./PersonAvatar";
import "./PeoplePanel.css";

const RECONNECTING_NOTICE = "Live actions will return when this person reconnects. You can still send a message.";
const MEMBER_LABEL = "Office member";
const SELF_LABEL = "You";
const HAND_RAISED_LABEL = "Hand raised";
const OFFLINE_NOTICE = "This person is offline. You can still send a message.";
export type PersonCardProps = PersonActionContext & PersonActionCallbacks & { entry: DirectoryEntry; id?: string; presentation?: "inline" | "profile" };

export function PersonCard(props: PersonCardProps) {
  const person = props.entry[1];
  const profile = props.presentation === "profile";
  const isSelf = props.entry[0] === props.localSessionId || person.username === props.localUsername;
  const customStatus = customStatusLabel(person);
  const actions = buildPersonActions(props.entry, props);
  const meetDisabledReason = actions.find(action => action.id === "meet")?.disabledReason;
  return <div id={props.id} className={`directory-person-details${profile ? " directory-person-profile" : ""}`} aria-label={`Profile for ${person.displayName || person.username}`}>
    <div className="directory-person-identity"><PersonAvatar person={person} />
      <div className="directory-person-name"><strong>{person.displayName || person.username}</strong>
        <span className="directory-username">@{person.username}</span></div>
    </div>
    <div className="directory-person-badges"><span className={`directory-status-badge ${person.presence}`}>{personPresenceLabel(person)}</span>
      {profile && <span>{isSelf ? SELF_LABEL : MEMBER_LABEL}</span>}
      {person.handRaised && <span aria-label={HAND_RAISED_LABEL}>✋</span>}
    </div>
    {customStatus && <p className="directory-custom-status">{customStatus}</p>}
    <div className="directory-actions">{actions.map((action) => <button key={action.id} type="button" disabled={action.disabled}
      title={action.disabledReason} aria-pressed={action.pressed} onClick={() => runPersonAction(action, props.entry, props)}>{action.label}</button>)}</div>
    {meetDisabledReason && <p className="directory-notice">{meetDisabledReason}</p>}
    {person.presence !== "online" && <p className="directory-notice">{person.presence === "offline" ? OFFLINE_NOTICE : RECONNECTING_NOTICE}</p>}
  </div>;
}
