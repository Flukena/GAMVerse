import { useId, useRef } from "react";
import { OFFICE_SHARE_LINK_TTL_DAYS } from "@gammyverse/shared";
import { SHARE_OFFICE_LABEL, type OfficeShareSnapshot } from "./officeShareLinks";
import { WorkspaceDialog } from "./WorkspaceDialog";
import "./ShareOfficeDialog.css";

const CLOSE_LABEL = "Close";
const CREATE_LABEL = "Create share link";
const COPYING_LABEL = "Copy link";
const LINKS_LABEL = "Active share links";
const REVOKE_LABEL = "Revoke";
const RETRY_LABEL = "Reload links";
const EMPTY_LABEL = "No active share links.";
const LINK_LABEL = "New office share link";
const CREATING_LABEL = "Creating…";
const LOADING_LABEL = "Loading links…";
const CREATED_LABEL = "Created";
const EXPIRES_LABEL = "Expires";
const ACCESS_LABEL = `Anyone with the link can sign in or create an account and join as a member. Each link works for multiple people for ${OFFICE_SHARE_LINK_TTL_DAYS} days, unless revoked.`;
export type ShareOfficeDialogProps = {
  state: OfficeShareSnapshot; onClose(): void; onCreate(): void; onCopy(): void; onRevoke(id: string): void; onRefresh(): void;
};
export function ShareOfficeDialog(props: ShareOfficeDialogProps) {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const pending = props.state.busy !== null;
  return <WorkspaceDialog labelledBy={`${id}-title`} onClose={props.onClose} initialFocusRef={closeRef} className="share-office-dialog">
    <section aria-busy={pending}>
      <h2 id={`${id}-title`}>{SHARE_OFFICE_LABEL}</h2><h3>{props.state.office?.name}</h3>
      <p>{ACCESS_LABEL}</p>
      <button type="button" disabled={pending} onClick={props.onCreate}>{props.state.busy === "creating" ? CREATING_LABEL : CREATE_LABEL}</button>
      {props.state.url && <div className="share-office-url"><label htmlFor={`${id}-link`}>{LINK_LABEL}</label>
        <input id={`${id}-link`} readOnly value={props.state.url} onFocus={event => event.currentTarget.select()} />
        <button type="button" disabled={pending} onClick={props.onCopy}>{COPYING_LABEL}</button>
      </div>}
      {props.state.copyMessage && <p role="status">{props.state.copyMessage}</p>}
      {props.state.error && <p role="alert">{props.state.error}</p>}
      <div className="share-office-heading"><h3>{LINKS_LABEL}</h3><button type="button" disabled={pending} onClick={props.onRefresh}>{RETRY_LABEL}</button></div>
      {props.state.busy === "loading" ? <p role="status">{LOADING_LABEL}</p> : <ul className="share-office-links">{props.state.links.map(link => <li key={link.id}>
        <span>{CREATED_LABEL} {new Date(link.createdAt).toLocaleString()}<small>{EXPIRES_LABEL} {new Date(link.expiresAt).toLocaleString()}</small></span>
        <button type="button" disabled={pending} onClick={() => props.onRevoke(link.id)}>{REVOKE_LABEL}</button>
      </li>)}</ul>}
      {!pending && !props.state.error && props.state.links.length === 0 && <p>{EMPTY_LABEL}</p>}
      <footer><button type="button" ref={closeRef} onClick={props.onClose}>{CLOSE_LABEL}</button></footer>
    </section>
  </WorkspaceDialog>;
}
