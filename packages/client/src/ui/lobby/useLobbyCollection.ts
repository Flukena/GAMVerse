import { useEffect, useState } from "react";

const SEARCH_DEBOUNCE_MS = 300;
const LOBBY_PAGE_SIZE_ITEMS = 12;

export function useLobbyCollection<T>(endpoint: string, path: string, key: string, revision?: unknown, extraQuery = "") {
  const [search, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(extraQuery);
      query.set("search", search.trim());
      query.set("page", String(page));
      query.set("pageSize", String(LOBBY_PAGE_SIZE_ITEMS));
      void fetch(`${endpoint}${path}?${query}`, { credentials: "include", signal: controller.signal })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Could not load this collection.");
          if (controller.signal.aborted) return;
          const lastPage = Math.max(1, Math.ceil(result.total / LOBBY_PAGE_SIZE_ITEMS));
          if (page > lastPage) { setPage(lastPage); return; }
          setItems(Array.isArray(result[key]) ? result[key] : []);
          setTotal(result.total);
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load this collection.");
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [endpoint, path, key, search, page, revision, extraQuery, reload]);

  return {
    search, setSearch: (value: string) => { setSearchInput(value); setPage(1); },
    page, setPage, items, setItems, total, loading, error,
    pageSize: LOBBY_PAGE_SIZE_ITEMS,
    retry: () => setReload((current) => current + 1),
  };
}
