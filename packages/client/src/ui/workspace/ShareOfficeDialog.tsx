import { useId, useRef, useState } from "react";
import { OFFICE_SHARE_LINK_TTL_DAYS } from "@gammyverse/shared";
import { SHARE_OFFICE_LABEL, type OfficeShareSnapshot } from "./officeShareLinks";
import { WorkspaceDialog } from "./WorkspaceDialog";
import "./ShareOfficeDialog.css";

const CLOSE_LABEL = "Close";
const CREATE_PUBLIC_LABEL = "Create public link";
const CREATE_ONE_TIME_LABEL = "Create one-time invite";
const COPYING_LABEL = "Copy link";
const LINKS_LABEL = "Active public links";
const REVOKE_LABEL = "Revoke";
const RETRY_LABEL = "Reload links";
const EMPTY_LABEL = "No active share links.";
const LINK_LABEL = "Public office link";
const ONE_TIME_LINK_LABEL = "Single-use invite link";
const CREATING_LABEL = "Creating…";
const LOADING_LABEL = "Loading links…";
const CREATED_LABEL = "Created";
const EXPIRES_LABEL = "Expires";
const PUBLIC_ACCESS_LABEL = `Anyone with the link can sign in or create an account and join as a member. It works for multiple people for ${OFFICE_SHARE_LINK_TTL_DAYS} days, unless revoked.`;
const ONE_TIME_ACCESS_LABEL = "Create a private invite for one person. The first person to accept it uses the link; it expires after 7 days.";
export type ShareOfficeDialogProps = {
  state: OfficeShareSnapshot; onClose(): void; onCreate(): void; onCreateOneTime(): void; onCopy(): void; onCopyOneTime(): void; onRevoke(id: string): void; onRefresh(): void;
};
export function ShareOfficeDialog(props: ShareOfficeDialogProps) {
  const id = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [linkType, setLinkType] = useState<"public" | "one-time">("public");
  const pending = props.state.busy !== null;
  const publicLinkSelected = linkType === "public";
  const selectedUrl = publicLinkSelected ? props.state.url : props.state.oneTimeUrl;
  const createSelectedLink = publicLinkSelected ? props.onCreate : props.onCreateOneTime;
  const copySelectedLink = publicLinkSelected ? props.onCopy : props.onCopyOneTime;
  const creatingSelectedLink = props.state.busy === (publicLinkSelected ? "creating" : "creating-one-time");
  const selectedLinkLabel = publicLinkSelected ? LINK_LABEL : ONE_TIME_LINK_LABEL;
  return <WorkspaceDialog labelledBy={`${id}-title`} onClose={props.onClose} initialFocusRef={closeRef} className="share-office-dialog">
    <section aria-busy={pending}>
      <h2 id={`${id}-title`}>{SHARE_OFFICE_LABEL}</h2><h3>{props.state.office?.name}</h3>
      <span className="share-office-field-label">Link type</span>
      <div className="share-office-type-picker" role="group" aria-label="Link type">
        <button type="button" aria-pressed={publicLinkSelected} className={publicLinkSelected ? "is-selected" : ""} onClick={() => setLinkType("public")}>
          <strong>Public</strong><small>Anyone with the link · multiple people</small>
        </button>
        <button type="button" aria-pressed={!publicLinkSelected} className={!publicLinkSelected ? "is-selected" : ""} onClick={() => setLinkType("one-time")}>
          <strong>One person</strong><small>First person to accept · single use</small>
        </button>
      </div>
      <p className="share-office-type-description">{publicLinkSelected ? PUBLIC_ACCESS_LABEL : ONE_TIME_ACCESS_LABEL}</p>
      <button type="button" className="share-office-create" disabled={pending} onClick={createSelectedLink}>
        {creatingSelectedLink ? CREATING_LABEL : publicLinkSelected ? CREATE_PUBLIC_LABEL : CREATE_ONE_TIME_LABEL}
      </button>
      {selectedUrl && <div className="share-office-url"><label htmlFor={`${id}-link`}>{selectedLinkLabel}</label>
        <input id={`${id}-link`} readOnly value={selectedUrl} onFocus={event => event.currentTarget.select()} />
        <button type="button" disabled={pending} onClick={copySelectedLink}>{COPYING_LABEL}</button>
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
