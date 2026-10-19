const DEFAULT_PAGE_SIZE_ITEMS = 12;
const MAX_PAGE_SIZE_ITEMS = 100;
const MAX_SEARCH_LENGTH_CHARS = 200;
const MAX_PAGE_NUMBER = 1_000_000;

export type LobbyPageOptions = { search: string; page: number; pageSize: number; offset: number };

/** HTTP query values may be repeated or nested. Accept only scalar strings. */
export function parseLobbyPageOptions(query: Record<string, unknown> = {}): LobbyPageOptions {
  function integer(key: string, fallback: number, maximum: number) {
    const raw = query[key];
    if (raw === undefined) return fallback;
    if (typeof raw !== "string" || !/^-?\d+$/.test(raw)) throw new Error(`${key} must be an integer.`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) throw new Error(`${key} must be an integer.`);
    return Math.max(1, Math.min(maximum, value));
  }
  if (query.search !== undefined && typeof query.search !== "string") throw new Error("search must be a string.");
  const search = typeof query.search === "string" ? query.search.trim().slice(0, MAX_SEARCH_LENGTH_CHARS) : "";
  const page = integer("page", 1, MAX_PAGE_NUMBER);
  const pageSize = integer("pageSize", DEFAULT_PAGE_SIZE_ITEMS, MAX_PAGE_SIZE_ITEMS);
  return { search, page, pageSize, offset: (page - 1) * pageSize };
}

/** Search text is literal, including user-entered percent and underscore characters. */
export function lobbySearchPattern(search: string) {
  return search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : null;
}
