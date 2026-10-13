import { useCallback, useEffect, useRef, useState } from "react";
import "./MaintainerSystemPanel.css";

const REFRESH_INTERVAL_MS = 30_000;

type ServiceStatus = { status?: string | null };
type Overview = {
  services?: {
    api?: ServiceStatus | null;
    database?: ServiceStatus | null;
    realtime?: (ServiceStatus & { activeRooms?: number | null; activeParticipants?: number | null }) | null;
  } | null;
  counts?: {
    accounts?: number | null;
    suspendedAccounts?: number | null;
    offices?: number | null;
    activeOffices?: number | null;
    officeActivity24h?: number | null;
  } | null;
  recentErrors?: { count?: number | null; windowMinutes?: number | null; complete?: boolean | null } | null;
};
type OverviewResponse = Overview & { error?: string };

function availableCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value.toLocaleString() : "Unavailable";
}

function statusTone(status: string | null | undefined) {
  const value = status?.toLowerCase();
  if (!value) return "unknown";
  if (["ok", "healthy", "up", "ready", "connected"].includes(value)) return "healthy";
  if (["degraded", "starting", "reconnecting", "warning"].includes(value)) return "warning";
  if (["down", "unhealthy", "failed", "error", "unavailable"].includes(value)) return "error";
  return "unknown";
}

function statusLabel(status: string | null | undefined) {
  return status?.trim() || "Unavailable";
}

function formatTimestamp(value: Date | null) {
  if (!value) return "Not updated yet";
  return value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function fetchOverview(endpoint: string, signal: AbortSignal) {
  const response = await fetch(`${endpoint}/maintainer/overview`, { credentials: "include", signal });
  const result = await response.json().catch(() => ({})) as OverviewResponse;
  if (!response.ok) throw new Error(result.error || `Could not load system status (${response.status}).`);
  return result;
}

export function MaintainerSystemPanel({ endpoint }: { endpoint: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(false);

  const refresh = useCallback(async (signal?: AbortSignal, initial = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    const controller = signal ? null : new AbortController();
    try {
      const result = await fetchOverview(endpoint, signal ?? controller!.signal);
      if (signal?.aborted || !mountedRef.current) return;
      setOverview(result);
      setLastUpdated(new Date());
    } catch (cause) {
      if (signal?.aborted || !mountedRef.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load system status.");
    } finally {
      if (!signal?.aborted && mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      inFlightRef.current = false;
    }
  }, [endpoint]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    void refresh(controller.signal, true);
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      inFlightRef.current = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refresh]);

  const services = overview?.services;
  const counts = overview?.counts;
  const serviceCards = [
    { key: "api", title: "API", status: services?.api?.status },
    { key: "database", title: "Database", status: services?.database?.status },
    { key: "realtime", title: "Realtime", status: services?.realtime?.status, rooms: services?.realtime?.activeRooms, participants: services?.realtime?.activeParticipants },
  ];
  const countCards = [
    { label: "Accounts", value: counts?.accounts },
    { label: "Suspended accounts", value: counts?.suspendedAccounts },
    { label: "Offices", value: counts?.offices },
    { label: "Active offices", value: counts?.activeOffices },
    { label: "Office activity · 24h", value: counts?.officeActivity24h },
  ];

  return <section className="lobby-panel maintainer-system-panel" aria-labelledby="maintainer-system-title">
    <div className="card-heading">
      <div><span className="eyebrow">OPERATIONS</span><h2 id="maintainer-system-title">System overview</h2></div>
      <div className="maintainer-system-refresh-meta">
        <span>{refreshing ? "Refreshing…" : `Updated ${formatTimestamp(lastUpdated)}`}</span>
        <button type="button" className="lobby-button quiet" disabled={loading || refreshing} onClick={() => void refresh(undefined, !overview)}>{refreshing ? "Refreshing…" : "Refresh"}</button>
      </div>
    </div>
    {error && <div className="maintainer-system-error" role="alert"><span>{error}</span><button type="button" className="lobby-button quiet" disabled={refreshing} onClick={() => void refresh(undefined, !overview)}>Retry</button></div>}
    {loading && !overview ? <p className="empty-people" role="status">Loading system status…</p> : <>
      <div className="maintainer-system-services" aria-label="Service health">
        {serviceCards.map((service) => <article className="maintainer-system-card" key={service.key} aria-label={`${service.title} service status`}>
          <span className="eyebrow">{service.title}</span>
          <span className={`maintainer-system-status is-${statusTone(service.status)}`} role="status"><i aria-hidden="true" />{statusLabel(service.status)}</span>
          {service.key === "realtime" && <div className="maintainer-system-service-details">
            <span><strong>{availableCount(service.rooms)}</strong> active rooms</span>
            <span><strong>{availableCount(service.participants)}</strong> participants</span>
          </div>}
        </article>)}
      </div>
      <div className="maintainer-system-counts" aria-label="Platform counts">
        {countCards.map((item) => <article className="maintainer-system-count" key={item.label}>
          <span>{item.label}</span><strong>{availableCount(item.value)}</strong>
        </article>)}
        <article className="maintainer-system-count">
          <span>Server errors · {availableCount(overview?.recentErrors?.windowMinutes)} min</span>
          <strong>{overview?.recentErrors?.complete === false ? `Partial · ${availableCount(overview?.recentErrors?.count)}` : availableCount(overview?.recentErrors?.count)}</strong>
        </article>
      </div>
      {!overview && !error && <p className="empty-people">System status has not been returned yet.</p>}
    </>}
  </section>;
}
