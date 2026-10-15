import { parseLobbyPageOptions } from "../infra/lobbyPagination.js";
import { listLobbyPage, type LobbyListKind, type LobbySession } from "../offices/lobbyRepository.js";
import { errorMessage } from "./middleware.js";

/** Authorize before reading query parameters or accessing any directory data. */
export async function lobbyPageEndpoint(
  kind: LobbyListKind,
  session: LobbySession | null,
  query: Record<string, unknown> = {},
  list: typeof listLobbyPage = listLobbyPage,
) {
  const maintainerOnly = kind === "users" || kind === "events";
  if (maintainerOnly && session?.role !== "maintainer") return { status: 403, body: { error: "Maintainer access required." } };
  if (!session) return { status: 401, body: { error: "Authentication required." } };
  let options;
  try { options = parseLobbyPageOptions(query); }
  catch (error) { return { status: 400, body: { error: errorMessage(error) } }; }
  for (const key of ["action", "targetType", "targetId"]) {
    if (kind === "events" && query[key] !== undefined && typeof query[key] !== "string") return { status: 400, body: { error: `${key} must be a string.` } };
  }
  try {
    const result = await list(kind, session, options, {
      action: typeof query.action === "string" ? query.action : undefined,
      targetType: typeof query.targetType === "string" ? query.targetType : undefined,
      targetId: typeof query.targetId === "string" ? query.targetId : undefined,
    });
    return { status: 200, body: { [kind]: result.items, total: result.total, page: options.page, pageSize: options.pageSize } };
  } catch (error) { return { status: 503, body: { error: errorMessage(error) } }; }
}
