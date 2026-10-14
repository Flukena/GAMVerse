import { normalizeAccountUsername } from "@gammyverse/shared";
import {
  chatHistory,
  ChatHistoryAuthorizationError,
} from "../offices/chatRepository.js";
import { getSession } from "../auth/service.js";
import {
  sessionFromCookie,
  type HttpRequest,
  type HttpResponse,
} from "../http/middleware.js";

const AUTHENTICATION_REQUIRED_LABEL = "Authentication required.";
const CHAT_HISTORY_INVALID_QUERY_LABEL = "Invalid chat history query.";
const CHAT_HISTORY_ACCESS_DENIED_LABEL = "Chat history access denied.";
const HTTP_UNAUTHORIZED_STATUS = 401;
const HTTP_BAD_REQUEST_STATUS = 400;
const HTTP_FORBIDDEN_STATUS = 403;
const HTTP_SERVICE_UNAVAILABLE_STATUS = 503;
const CHAT_HISTORY_UNAVAILABLE_LABEL = "Chat history unavailable.";
// PostgreSQL signed bigint schema bound.
const MAX_BIGINT_CURSOR_ID = 9_223_372_036_854_775_807n;
const MAX_BIGINT_CURSOR_DIGITS = MAX_BIGINT_CURSOR_ID.toString().length;
export function validChatHistoryQuery(query: HttpRequest["query"]) {
  if (query?.scope !== "office" && query?.scope !== "dm") return false;
  if (query.scope === "dm" && normalizeAccountUsername(query.with) === null)
    return false;
  return validCursor(query.before);
}
function validCursor(before: unknown) {
  if (before === undefined) return true;
  if (
    typeof before !== "string" ||
    before.length > MAX_BIGINT_CURSOR_DIGITS ||
    !/^\d+$/.test(before)
  )
    return false;
  const id = BigInt(before);
  return id > 0n && id <= MAX_BIGINT_CURSOR_ID;
}
export function chatHistoryFailureStatus(error: unknown) {
  return error instanceof ChatHistoryAuthorizationError
    ? HTTP_FORBIDDEN_STATUS
    : HTTP_SERVICE_UNAVAILABLE_STATUS;
}
export async function chatHistoryEndpoint(
  request: HttpRequest,
  response: HttpResponse,
) {
  const session = await getSession(sessionFromCookie(request.header("cookie")));
  if (!session) {
    response
      .status(HTTP_UNAUTHORIZED_STATUS)
      .json({ error: AUTHENTICATION_REQUIRED_LABEL });
    return;
  }
  if (!validChatHistoryQuery(request.query)) {
    response
      .status(HTTP_BAD_REQUEST_STATUS)
      .json({ error: CHAT_HISTORY_INVALID_QUERY_LABEL });
    return;
  }
  try {
    const target = normalizeAccountUsername(request.query?.with) ?? undefined;
    const messages = await chatHistory(
      session.username,
      request.params.officeId!,
      request.query?.scope,
      target,
      request.query?.before,
    );
    response.json({ messages });
  } catch (error) {
    response.status(chatHistoryFailureStatus(error)).json({
      error:
        error instanceof ChatHistoryAuthorizationError
          ? CHAT_HISTORY_ACCESS_DENIED_LABEL
          : CHAT_HISTORY_UNAVAILABLE_LABEL,
    });
  }
}
