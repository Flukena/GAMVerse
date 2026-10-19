import { useId } from "react";
import { ConversationPrivacyControls } from "./ConversationPrivacyControls";
import { KnockStatusCard } from "./KnockStatusCard";
import { KnockRequestPanel } from "./KnockRequestPanel";
import { PRIVATE_ACCESS_POLICY_LABEL } from "./conversationAccessPresentation";
import type { ConversationAccessModel } from "./useConversationAccess";
import "./ConversationAccess.css";

const ACCESS_LABEL = "Room privacy and admission";
const SELECT_ROOM_LABEL = "Select a room or desk";
const EMPTY_SELECTION_LABEL = "Choose a room or desk to view its access settings.";
const REFRESH_LABEL = "Refresh room access";
const LOADING_LABEL = "Checking room access…";
export function ConversationAccessPanel({ access, connected }: { access: ConversationAccessModel; connected: boolean }) {
  const id = useId();
  return <section className="conversation-access-panel" aria-label={ACCESS_LABEL} aria-busy={access.pending}>
    <h2>{ACCESS_LABEL}</h2>
    <label htmlFor={id}>{SELECT_ROOM_LABEL}</label>
    <select id={id} value={access.zoneId ?? ""} disabled={!connected} onChange={event => access.selectZone(event.target.value)}>
      <option value="">{SELECT_ROOM_LABEL}</option>
      {access.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
    </select>
    <p className="conversation-explanation">{PRIVATE_ACCESS_POLICY_LABEL}</p>
    {access.error && <p role="alert">{access.error}</p>}
    {!access.zoneId && <p>{EMPTY_SELECTION_LABEL}</p>}
    {access.zoneId && !access.snapshot && access.pending && <p role="status">{LOADING_LABEL}</p>}
    {access.zoneId && <button type="button" disabled={!connected || access.pending} onClick={access.sync}>{REFRESH_LABEL}</button>}
    <ConversationPrivacyControls access={access} connected={connected} />
    <KnockStatusCard access={access} connected={connected} />
    <KnockRequestPanel access={access} connected={connected} />
  </section>;
}
