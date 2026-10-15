import { useId, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import type { OfficeDeskAdministrationSnapshot } from "@gammyverse/shared";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { useDeskManager } from "./useDeskManager";
import type { DeskManagerContext } from "./deskManager";
import { deskManagerMembers, deskManagerRows, deskOwnerDisplayName, vacantDeskIntent, type DeskManagerIntent } from "./deskManagerState";
import "./DeskManagerDialog.css";

const MANAGER_LABEL = "Desk manager";
const CLOSE_LABEL = "Close desk manager";
const RELOAD_LABEL = "Reload desks";
const VACANT_LABEL = "Vacant";
const SELECT_MEMBER_LABEL = "Choose an office member";
const SEARCH_DESKS_LABEL = "Search desks or assigned members";
const SEARCH_MEMBERS_LABEL = "Find a member to assign or move";
const ASSIGN_LABEL = "Assign desk";
const MOVE_LABEL = "Move to this desk";
const UNASSIGN_LABEL = "Unassign desk";
const OWNED_MEMBER_SUFFIX_LABEL = " · currently owns a desk";
const EMPTY_LABEL = "This office has no desks. Add private desk zones in the map editor first.";
const NO_MATCH_LABEL = "No desks match this search.";
const LOADING_LABEL = "Loading desks and office members…";
const SAVED_LABEL = "Desk assignment saved.";
const SAVED_PENDING_LABEL = "Assignment saved. The office is still updating. Reload desks to finish applying the change.";
const OFFICE_UPDATING_LABEL = "The office is still updating desk access. Reload desks before making changes.";
const RELOAD_REQUIRED_LABEL = "Desk information changed or could not be confirmed. Reload, review the current owners, and retry explicitly.";
const OFFLINE_MEMBERS_LABEL = "All eligible office members are listed, including offline members. Choose a member, then a vacant desk to assign or move them; occupied desks are never replaced.";
type RowProps = { desk: OfficeDeskAdministrationSnapshot["desks"][number]; snapshot: OfficeDeskAdministrationSnapshot; selectedUsername: string | null; disabled: boolean; pending: boolean; submit(intent: DeskManagerIntent): void };
function DeskRow({ desk, snapshot, selectedUsername, disabled, pending, submit }: RowProps) {
  const intent = selectedUsername ? vacantDeskIntent(snapshot, desk.id, selectedUsername) : null;
  const ownerName = deskOwnerDisplayName(snapshot, desk);
  return <li className="desk-manager-row" aria-busy={pending}>
    <div className="desk-manager-row-heading"><strong>{desk.name}</strong><small>{ownerName ?? VACANT_LABEL}</small></div>
    {desk.ownerUsername === null ? <button type="button" disabled={disabled || !intent} onClick={() => { if (intent) submit(intent); }}>{intent?.action === "move" ? MOVE_LABEL : ASSIGN_LABEL}</button>
      : <button type="button" disabled={disabled} onClick={() => submit({ action: "unassign", deskId: desk.id })}>{UNASSIGN_LABEL}</button>}
  </li>;
}
export interface DeskManagerDialogProps { context: DeskManagerContext; officeName: string; room?: Room | null; onClose(): void; onChanged?(): void }
export function DeskManagerDialog(props: DeskManagerDialogProps) {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const manager = useDeskManager(props.context, props.room);
  const [deskQuery, setDeskQuery] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [username, setUsername] = useState("");
  const snapshot = manager.snapshot;
  const members = snapshot ? deskManagerMembers(snapshot, memberQuery) : [];
  const selectedUsername = members.find(member => member.username === username)?.username ?? null;
  const desks = snapshot ? deskManagerRows(snapshot, deskQuery) : [];
  const disabled = manager.loading || manager.pendingDeskId !== null || manager.needsReload;
  const submit = async (intent: DeskManagerIntent) => { if (await manager.submit(intent)) props.onChanged?.(); };
  return <WorkspaceDialog labelledBy={id} onClose={props.onClose} initialFocusRef={closeRef} className="desk-manager-dialog">
    <header><div><h2 id={id}>{MANAGER_LABEL}</h2><p>{props.officeName}</p></div><button ref={closeRef} type="button" aria-label={CLOSE_LABEL} onClick={props.onClose}>×</button></header>
    <div className="desk-manager-body">
      <p>{OFFLINE_MEMBERS_LABEL}</p>
      <button type="button" disabled={manager.loading || manager.pendingDeskId !== null} onClick={() => void manager.refresh()}>{RELOAD_LABEL}</button>
      {manager.loading && <p role="status">{LOADING_LABEL}</p>}
      {manager.error && <p className="desk-manager-error" role="alert">{manager.error}</p>}
      {manager.saved && <p role="status">{manager.saved.realtimeSync === "pending" ? SAVED_PENDING_LABEL : SAVED_LABEL}</p>}
      {manager.snapshot?.realtimeSync === "pending" && !manager.saved && <p role="status">{OFFICE_UPDATING_LABEL}</p>}
      {manager.needsReload && <p>{RELOAD_REQUIRED_LABEL}</p>}
      {snapshot && <>
        <div className="desk-manager-search"><label htmlFor={`${id}-member-query`}>{SEARCH_MEMBERS_LABEL}</label><input id={`${id}-member-query`} type="search" value={memberQuery} onChange={event => setMemberQuery(event.target.value)} />
          <label htmlFor={`${id}-member`}>{SELECT_MEMBER_LABEL}</label><select id={`${id}-member`} disabled={disabled} value={selectedUsername ?? ""} onChange={event => setUsername(event.target.value)}>
            <option value="">{SELECT_MEMBER_LABEL}</option>{members.map(member => <option key={member.username} value={member.username}>{member.displayName}{snapshot.desks.some(desk => desk.ownerUsername === member.username) ? OWNED_MEMBER_SUFFIX_LABEL : ""}</option>)}
          </select>
          <label htmlFor={`${id}-desk-query`}>{SEARCH_DESKS_LABEL}</label><input id={`${id}-desk-query`} type="search" value={deskQuery} onChange={event => setDeskQuery(event.target.value)} /></div>
        {snapshot.desks.length === 0 ? <p>{EMPTY_LABEL}</p> : desks.length === 0 ? <p>{NO_MATCH_LABEL}</p> : <ul>{desks.map(desk => <DeskRow key={desk.id} desk={desk} snapshot={snapshot} selectedUsername={selectedUsername} disabled={disabled} pending={manager.pendingDeskId === desk.id} submit={intent => { void submit(intent); }} />)}</ul>}
      </>}
    </div>
  </WorkspaceDialog>;
}
