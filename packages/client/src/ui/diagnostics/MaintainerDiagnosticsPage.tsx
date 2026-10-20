import { MaintainerDiagnosticsPanel } from "./MaintainerDiagnosticsPanel";

export function MaintainerDiagnosticsPage({ endpoint, allowed }: { endpoint: string; allowed: boolean }) {
  return <main className="lobby-shell diagnostics-page">
    <header className="diagnostics-topbar">
      <a className="diagnostics-brand" href="/" aria-label="GAMVerse lobby"><span className="brand-mark" aria-hidden="true">G</span><strong>GAMVerse</strong></a>
      <span className="diagnostics-access">Maintainer workspace</span>
    </header>
    <div className="diagnostics-content">
      <a className="diagnostics-back" href="/">← Back to lobby</a>
      <div className="diagnostics-intro">
        <div><span className="eyebrow">PLATFORM OPERATIONS</span><h1>Runtime diagnostics</h1>
          <p>Understand performance issues and connection failures across your offices.</p></div>
        <span className="diagnostics-retention">7-day history</span>
      </div>
    {allowed ? <MaintainerDiagnosticsPanel endpoint={endpoint} /> : <section className="lobby-panel">
      <p role="alert">Platform maintainer access is required to view diagnostics.</p>
    </section>}
    </div>
  </main>;
}
