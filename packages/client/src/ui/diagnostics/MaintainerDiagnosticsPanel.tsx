import { useCallback, useEffect, useRef, useState } from "react";
import { CLIENT_DIAGNOSTIC_CODES, SERVER_DIAGNOSTIC_CODES, type DiagnosticItem, type DiagnosticPage } from "@gammyverse/shared";
import "./MaintainerDiagnosticsPanel.css";

const EVENTS_PER_PAGE = 10;
const PAGES_PER_BATCH = 5;

export function MaintainerDiagnosticsPanel({ endpoint }: { endpoint: string }) {
  const [items, setItems] = useState<DiagnosticItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("all");
  const [eventCode, setEventCode] = useState("all");
  const [office, setOffice] = useState("");
  const [pageBefore, setPageBefore] = useState<string | undefined>();
  const [previousPages, setPreviousPages] = useState<(string | undefined)[]>([]);
  const [batchPage, setBatchPage] = useState(0);
  const panel = useRef<HTMLElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async (before?: string, history: (string | undefined)[] = [], lastPage = false) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${endpoint}/maintainer/diagnostics${before ? `?before=${encodeURIComponent(before)}` : ""}`, {
        credentials: "include", signal: request.signal,
      });
      if (!response.ok) throw new Error(`Could not load diagnostics (HTTP ${response.status}).`);
      const result: DiagnosticPage = await response.json();
      if (request.signal.aborted) return;
      setItems(result.items);
      setPageBefore(before);
      setPreviousPages(history);
      setCursor(result.nextCursor);
      setLoaded(true);
      setBatchPage(lastPage ? Math.max(0, Math.ceil(result.items.length / EVENTS_PER_PAGE) - 1) : 0);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load diagnostics.");
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [endpoint]);
  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);
  const pageItems = items.slice(batchPage * EVENTS_PER_PAGE, (batchPage + 1) * EVENTS_PER_PAGE);
  const visibleItems = pageItems.filter(item =>
    (source === "all" || item.source === source)
    && (eventCode === "all" || item.code === eventCode)
    && (!office.trim() || (item.officeId ?? "Process / lobby").toLowerCase().includes(office.trim().toLowerCase())));
  const pageCount = Math.ceil(items.length / EVENTS_PER_PAGE);
  const pageNumber = previousPages.length * PAGES_PER_BATCH + batchPage + 1;
  const scrollToPanel = () => panel.current?.scrollIntoView({ block: "start", behavior: "instant" });
  return <section ref={panel} className="lobby-panel diagnostics-panel" aria-labelledby="diagnostics-heading">
    <div className="card-heading diagnostics-panel-heading">
      <div><h2 id="diagnostics-heading">Incident history</h2><p>Technical observations · All offices</p></div>
      <button className="lobby-button quiet" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh diagnostics"}</button>
    </div>
    <div className="diagnostics-context" aria-label="Collection scope">
      <span>Browser & server</span><span>Rate-limited collection</span><span>No private content</span>
    </div>
    <details className="diagnostics-collection"><summary>About collection & thresholds</summary>
      <p>Browser reports are unverified client observations. Server CPU is process CPU (100% = one core), not container CPU.</p>
      <p>Frame stalls ≥250 ms, average frames ≥50 ms over 5 s, long tasks ≥250 ms, connection failures and uncaught errors. Server: CPU ≥80% of one core over 5 s or event-loop stalls ≥250 ms. No chat, error text, URLs, tokens or form contents are stored.</p>
    </details>
    {error && <p className="diagnostics-error" role="alert">{error}</p>}
    {loading && <p role="status">Loading diagnostics…</p>}
    <div className="diagnostics-filters">
      <div><label htmlFor="diagnostic-source">Source</label><select id="diagnostic-source" value={source} onChange={event => setSource(event.target.value)}>
        <option value="all">All sources</option>{["browser", "api", "realtime"].map(value => <option key={value}>{value}</option>)}
      </select></div>
      <div><label htmlFor="diagnostic-event">Event</label><select id="diagnostic-event" value={eventCode} onChange={event => setEventCode(event.target.value)}>
        <option value="all">All events</option>{[...CLIENT_DIAGNOSTIC_CODES, ...SERVER_DIAGNOSTIC_CODES].sort().map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
      </select></div>
      <label>Office ID<input type="search" value={office} onChange={event => setOffice(event.target.value)} placeholder="Office ID or Process / lobby" /></label>
    </div>
    <p className="diagnostics-result-count" role="status"><strong>{visibleItems.length}</strong> of {pageItems.length} events on page {pageNumber} <span>· Filters apply to this page only</span></p>
    {loaded && !!items.length && !visibleItems.length && <p className="diagnostics-empty">No events on this page match these filters.</p>}
    {loaded && !items.length && <p className="diagnostics-empty">No stored events in the last 7 days. This does not prove that no incident occurred; reporting is sampled and may be unavailable during an outage.</p>}
    {!!items.length && <div className="diagnostics-table-scroll"><table className="diagnostics-table">
      <thead><tr><th>Received</th><th>Source</th><th>Event</th><th>Office</th><th>Measurements</th><th>Details</th></tr></thead>
      <tbody>{visibleItems.map(item => <tr key={item.id}>
        <td className="diagnostics-time"><time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleDateString()}<small>{new Date(item.occurredAt).toLocaleTimeString()}</small></time></td>
        <td><span className={`diagnostics-source is-${item.source}`}>{item.source}</span></td>
        <td className="diagnostics-event-name">{item.code.replaceAll("_", " ")}</td><td className="diagnostics-office">{item.officeId ?? "Process / lobby"}</td>
        <td className="diagnostics-measurements">{Object.entries(item.metrics).map(([key, value]) => <span key={key}>{key} <strong>{typeof value === "number" ? Math.round(value * 100) / 100 : "Unavailable"}</strong></span>)}{!Object.keys(item.metrics).length && <span>Event only</span>}</td>
        <td><details><summary>Event {item.id}</summary>
          <dl><dt>Event ID</dt><dd>{item.id}</dd><dt>Timestamp (UTC)</dt><dd>{item.occurredAt}</dd>
            <dt>Event code</dt><dd>{item.code}</dd><dt>Evidence</dt><dd>{item.source === "browser" ? "Unverified browser observation" : "Server process observation"}</dd>
          </dl><pre>{JSON.stringify(item, null, 2)}</pre>
        </details></td>
      </tr>)}</tbody>
    </table></div>}
    <footer className="diagnostics-footer"><p>10 events per page · Page {pageNumber}</p><nav className="diagnostics-pagination" aria-label="Diagnostic event pages">
      <button className="lobby-button quiet" disabled={loading || (!batchPage && !previousPages.length)} onClick={() => {
        if (batchPage) { setBatchPage(batchPage - 1); scrollToPanel(); return; }
        const before = previousPages.at(-1);
        void load(before, previousPages.slice(0, -1), true).then(scrollToPanel);
      }}>Previous</button>
      <div className="diagnostics-page-numbers">{Array.from({ length: pageCount }, (_, index) => {
        const number = previousPages.length * PAGES_PER_BATCH + index + 1;
        return <button key={number} className="lobby-button quiet" aria-label={`Page ${number}`} aria-current={batchPage === index ? "page" : undefined} disabled={loading} onClick={() => { setBatchPage(index); scrollToPanel(); }}>{number}</button>;
      })}</div>
      <button className="lobby-button quiet" disabled={loading || (batchPage >= pageCount - 1 && !cursor)} onClick={() => {
        if (batchPage < pageCount - 1) { setBatchPage(batchPage + 1); scrollToPanel(); return; }
        if (!cursor) return;
        void load(cursor, [...previousPages, pageBefore]).then(scrollToPanel);
      }}>Next</button>
    </nav></footer>
  </section>;
}
