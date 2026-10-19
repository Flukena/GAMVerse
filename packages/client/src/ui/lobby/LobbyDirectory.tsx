import { useState } from "react";
import { MaintainerAccountSafety, type MaintainerAccount } from "../MaintainerAccountSafety";
import { MaintainerAuditPanel } from "../MaintainerAuditPanel";
import { LobbyCollectionFeedback, LobbyCollectionPagination, LobbyCollectionSearch } from "./LobbyCollectionControls";
import { useLobbyCollection } from "./useLobbyCollection";
import "./LobbyDirectory.css";

type Office = { id: string; name: string; ownerUsername: string; role: "owner" | "admin" | "user" | "maintainer" };
type Invite = { id: string; officeName: string; inviter: string; role: "admin" | "user" };
type Props = {
  endpoint: string;
  username: string;
  maintainer: boolean;
  officesRevision: unknown;
  invitesRevision: unknown;
  busy: boolean;
  inviteToken: string | null;
  inviteBusyOfficeId: string | null;
  inviteFeedback: { officeId: string; message: string } | null;
  resetUrls: Record<string, string>;
  onEnter: (office: Office) => void;
  onManage: (office: Office) => void;
  onInviteLink: (officeId: string) => void;
  onAccept: (inviteId: string) => void;
  onResetLink: (username: string) => void | Promise<void>;
};

function OfficesPanel({ props }: { props: Props }) {
  const collection = useLobbyCollection<Office>(props.endpoint, "/offices", "offices", props.officesRevision);
  return <section className="lobby-panel" aria-labelledby="offices-title">
    <div className="card-heading"><div><span className="eyebrow">OFFICES</span><h2 id="offices-title">Your offices</h2></div><span className="count-chip">{collection.total}</span></div>
    <LobbyCollectionSearch label="offices" {...collection} />
    <LobbyCollectionFeedback {...collection} />
    {!collection.loading && !collection.error && (collection.items.length === 0 ? <p className="empty-people">{collection.search ? "No offices match your search." : "No offices yet. Create one or accept an invite."}</p> : <div className="office-grid">{collection.items.map((office) => <article className="office-tile" key={office.id}>
      <div><span className="live-indicator" /><span className="office-role">{office.role}</span></div><h3>{office.name}</h3><p>Owner: {office.ownerUsername}</p>
      <div className="office-tile-actions"><button className="lobby-button primary" disabled={props.busy} onClick={() => props.onEnter(office)}>Enter office</button>
        {["owner", "admin", "maintainer"].includes(office.role) ? <><button className="lobby-button" disabled={props.busy || props.inviteBusyOfficeId !== null} onClick={() => props.onInviteLink(office.id)}>{props.inviteBusyOfficeId === office.id ? "Creating invite…" : "Copy invite link"}</button><button className="lobby-button office-manage-button" disabled={props.busy} onClick={() => props.onManage(office)}>Manage office</button></> : <p className="invite-notice">Ask an office admin to invite someone.</p>}
      </div>{props.inviteFeedback?.officeId === office.id && <p className="invite-notice" role="status">{props.inviteFeedback.message}</p>}
    </article>)}</div>)}
    <LobbyCollectionPagination label="Offices" {...collection} />
  </section>;
}

function InvitationsPanel({ props }: { props: Props }) {
  const collection = useLobbyCollection<Invite>(props.endpoint, "/office-invites", "invites", props.invitesRevision);
  return <section className="lobby-panel" aria-labelledby="invites-title">
    <div className="card-heading"><div><span className="eyebrow">INVITATIONS</span><h2 id="invites-title">Invited to join</h2></div><span className="count-chip">{collection.total}</span></div>
    <LobbyCollectionSearch label="invitations" {...collection} /><LobbyCollectionFeedback {...collection} />
    {!collection.loading && !collection.error && (collection.items.length === 0 ? <p className="empty-people">{collection.search ? "No invitations match your search." : "No pending invitations."}</p> : <ul className="invite-list">{collection.items.map((invite) => <li key={invite.id}><div><strong>{invite.officeName}</strong><small>Invited by {invite.inviter} as {invite.role}</small></div><button className="lobby-button primary" disabled={props.busy} onClick={() => props.onAccept(invite.id)}>Accept</button></li>)}</ul>)}
    {props.inviteToken && <p className="invite-notice">Processing your one-time office invite…</p>}
    <LobbyCollectionPagination label="Invitations" {...collection} />
  </section>;
}

function AccountsPanel({ props }: { props: Props }) {
  const collection = useLobbyCollection<MaintainerAccount>(props.endpoint, "/maintainer/users", "users");
  return <div className="lobby-accounts-panel">
    <MaintainerAccountSafety accounts={collection.items} total={collection.total} loading={collection.loading} loadError={collection.error} onRetry={collection.retry}
      collectionControls={<LobbyCollectionSearch label="accounts" {...collection} />}
      pagination={<LobbyCollectionPagination label="Accounts" {...collection} />}
      endpoint={props.endpoint} currentUsername={props.username} resetUrls={props.resetUrls} onGenerateResetLink={props.onResetLink}
      onAccountUpdated={(updated) => { collection.setItems((current) => current.map((account) => account.username === updated.username ? updated : account)); collection.retry(); }} />
  </div>;
}

export function LobbyDirectory(props: Props) {
  const [tab, setTab] = useState("offices");
  const tabs = props.maintainer ? ["offices", "invitations", "accounts", "audit"] : ["offices", "invitations"];
  return <div className="lobby-directory">
    <nav className="lobby-section-tabs" role="tablist" aria-label="Workspace sections">{tabs.map((item) => <button key={item} type="button" role="tab" id={`${item}-tab`} aria-selected={tab === item} aria-controls={`${item}-panel`} className={tab === item ? "active" : ""} data-tutorial-target={item === "offices" || item === "invitations" ? `lobby-${item}` : undefined} onClick={() => setTab(item)}>{item[0]!.toUpperCase() + item.slice(1)}</button>)}</nav>
    <div className="lobby-tab-content" role="tabpanel" id={`${tab}-panel`} aria-labelledby={`${tab}-tab`}>
      {tab === "offices" && <OfficesPanel props={props} />}
      {tab === "invitations" && <InvitationsPanel props={props} />}
      {props.maintainer && tab === "accounts" && <AccountsPanel props={props} />}
      {props.maintainer && tab === "audit" && <MaintainerAuditPanel endpoint={props.endpoint} />}
    </div>
  </div>;
}
