import { useEffect, useState, type FormEvent } from "react";

const PAGE_SIZE = 50;

type MaintainerAuditEvent = {
  id: string;
  actorUsername: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
};
type AuditResponse = { events?: MaintainerAuditEvent[]; error?: string };
type AuditFilters = { action: string; targetId: string };

async function fetchAuditPage(endpoint: string, offset: number, filters: AuditFilters, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (filters.action) query.set("action", filters.action);
  if (filters.targetId) query.set("targetId", filters.targetId);
  const response = await fetch(`${endpoint}/maintainer/audit?${query}`, { credentials: "include", signal });
  const result = await response.json() as AuditResponse;
  if (!response.ok) throw new Error(result.error ?? "Could not load audit history.");
  return Array.isArray(result.events) ? result.events : [];
}

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
  const [events, setEvents] = useState<MaintainerAuditEvent[]>([]);
  const [busy, setBusy] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInput, setActionInput] = useState("");
  const [targetInput, setTargetInput] = useState("");
  const [filters, setFilters] = useState<AuditFilters>({ action: "", targetId: "" });

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    void fetchAuditPage(endpoint, 0, filters, controller.signal).then((page) => {
      if (!controller.signal.aborted) { setEvents(page); setHasMore(page.length === PAGE_SIZE); }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load audit history.");
    }).finally(() => {
      if (!controller.signal.aborted) setBusy(false);
    });
    return () => controller.abort();
  }, [endpoint, filters]);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEvents([]);
    setError(null);
    setFilters({ action: actionInput.trim(), targetId: targetInput.trim() });
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setError(null);
    setLoadingMore(true);
    try {
      const page = await fetchAuditPage(endpoint, events.length, filters);
      setEvents((current) => [...current, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load more audit history.");
    } finally {
      setLoadingMore(false);
    }
  };

  return <section className="lobby-panel maintainer-audit-panel" aria-labelledby="maintainer-audit-title">
    <div className="card-heading"><div><span className="eyebrow">PLATFORM ACTIVITY</span><h2 id="maintainer-audit-title">Audit history</h2></div><span className="count-chip">{events.length}</span></div>
    <form className="maintainer-audit-filters" onSubmit={applyFilters} role="search" aria-label="Filter audit history">
      <label>Action<input value={actionInput} onChange={(event) => setActionInput(event.target.value)} placeholder="e.g. office.deleted" /></label>
      <label>Target ID<input value={targetInput} onChange={(event) => setTargetInput(event.target.value)} placeholder="Account or office ID" /></label>
      <button className="lobby-button" type="submit" disabled={busy}>Filter</button>
      {(filters.action || filters.targetId) && <button className="lobby-button" type="button" disabled={busy} onClick={() => { setActionInput(""); setTargetInput(""); setEvents([]); setError(null); setFilters({ action: "", targetId: "" }); }}>Clear</button>}
    </form>
    {busy ? <p className="empty-people" role="status">Loading audit history…</p>
      : error && events.length === 0 ? <p className="auth-error" role="alert">{error}</p>
        : events.length === 0 ? <p className="empty-people">No platform actions have been recorded yet.</p>
          : <><ol className="maintainer-audit-list">{events.map((event) => <li key={event.id}>
            <div className="maintainer-audit-event"><strong>{readableAction(event.action)}</strong><span>{event.actorUsername} · {event.targetType.replaceAll("_", " ")} {event.targetId}</span></div>
            <time dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)}</time>
          </li>)}</ol>{error && <p className="auth-error" role="alert">{error}</p>}{hasMore && <button className="lobby-button maintainer-audit-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more"}</button>}</>}
  </section>;
}
