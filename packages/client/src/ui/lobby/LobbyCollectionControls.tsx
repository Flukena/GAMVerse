type Props = {
  label: string;
  search: string;
  setSearch: (value: string) => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  total: number;
  loading: boolean;
};

export function LobbyCollectionSearch({ label, search, setSearch }: Pick<Props, "label" | "search" | "setSearch">) {
  return <div className="lobby-collection-search" role="search" aria-label={`Search ${label}`}>
    <label>Search {label}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${label}…`} /></label>
    {search && <button className="lobby-button" type="button" onClick={() => setSearch("")}>Clear</button>}
  </div>;
}

export function LobbyCollectionPagination({ label, page, setPage, pageSize, total, loading }: Omit<Props, "search" | "setSearch">) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className="lobby-collection-pagination" aria-label={`${label} pages`}>
    <span aria-live="polite">{loading ? "Loading…" : total === 0 ? "0 results" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}</span>
    <div><button className="lobby-button" type="button" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page} of {pages}</span>
      <button className="lobby-button" type="button" disabled={loading || page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
  </nav>;
}

export function LobbyCollectionFeedback({ loading, error, retry }: { loading: boolean; error: string | null; retry: () => void }) {
  if (loading) return <p className="empty-people" role="status">Loading…</p>;
  if (error) return <div className="lobby-collection-error"><p className="auth-error" role="alert">{error}</p><button className="lobby-button" type="button" onClick={retry}>Retry</button></div>;
  return null;
}
