import { useState, type FormEvent } from "react";
import { useLobbyCollection } from "./lobby/useLobbyCollection";
import { LobbyCollectionSearch, LobbyCollectionPagination, LobbyCollectionFeedback } from "./lobby/LobbyCollectionControls";

type MaintainerAuditEvent = {
  id: string;
  actorUsername: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
};
type AuditFilters = { action: string; targetId: string };

const actionLabels: Record<string, string> = {
  "password_reset.issued": "Generated a password reset link",
  "office.created": "Created an office",
  "office.deleted": "Deleted an office",
  "office.renamed": "Renamed an office",
  "office_invite.issued": "Created an office invitation",
  "office_member.role_changed": "Changed an office member’s role",
  "office_member.removed": "Removed an office member",
};

function readableAction(action: string) {
  return actionLabels[action] ?? action.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function MaintainerAuditPanel({ endpoint }: { endpoint: string }) {
  const [actionInput, setActionInput] = useState("");
  const [targetInput, setTargetInput] = useState("");
  const [filters, setFilters] = useState<AuditFilters>({ action: "", targetId: "" });
  const query = new URLSearchParams(filters).toString();
  const collection = useLobbyCollection<MaintainerAuditEvent>(endpoint, "/maintainer/audit", "events", undefined, query);
  const { items: events, loading: busy, error } = collection;
  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    collection.setPage(1);
    setFilters({ action: actionInput.trim(), targetId: targetInput.trim() });
  };

  return <section className="lobby-panel maintainer-audit-panel" aria-labelledby="maintainer-audit-title">
    <div className="card-heading"><div><span className="eyebrow">PLATFORM ACTIVITY</span><h2 id="maintainer-audit-title">Audit history</h2></div><span className="count-chip">{collection.total}</span></div>
    <LobbyCollectionSearch label="audit history" {...collection} />
    <form className="maintainer-audit-filters" onSubmit={applyFilters} role="search" aria-label="Filter audit history">
      <label>Action<input value={actionInput} onChange={(event) => setActionInput(event.target.value)} placeholder="e.g. office.deleted" /></label>
      <label>Target ID<input value={targetInput} onChange={(event) => setTargetInput(event.target.value)} placeholder="Account or office ID" /></label>
      <button className="lobby-button" type="submit" disabled={busy}>Filter</button>
      {(filters.action || filters.targetId) && <button className="lobby-button" type="button" disabled={busy} onClick={() => { setActionInput(""); setTargetInput(""); collection.setPage(1); setFilters({ action: "", targetId: "" }); }}>Clear</button>}
    </form>
    <LobbyCollectionFeedback {...collection} />
    {!busy && !error && (events.length === 0 ? <p className="empty-people">No audit events match your search or filters.</p>
      : <ol className="maintainer-audit-list">{events.map((event) => <li key={event.id}>
        <div className="maintainer-audit-event"><strong>{readableAction(event.action)}</strong><span>{event.actorUsername} · {event.targetType.replaceAll("_", " ")} {event.targetId}</span></div>
        <time dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)}</time>
      </li>)}</ol>)}
    <LobbyCollectionPagination label="Audit history" {...collection} />
  </section>;
}
