import { tokenHash } from "../auth/service.js";
import { DeskAssignmentRequests } from "./deskAssignmentRequests.js";
import { isOfficeDeskAssignmentCommand, isOfficeDesksChanged } from "@gammyverse/shared";
import { logServerError } from "../infra/logger.js";
import { DeskAssignmentService } from "../offices/deskAssignmentService.js";
import { DeskAssignmentError } from "../offices/deskAssignments.js";
import { requestSession, sessionFromCookie, type HttpRequest, type HttpResponse } from "./middleware.js";

const HTTP_UNAUTHORIZED_STATUS = 401;
const HTTP_BAD_REQUEST_STATUS = 400;
const HTTP_FORBIDDEN_STATUS = 403;
const HTTP_CONFLICT_STATUS = 409;
const HTTP_UNAVAILABLE_STATUS = 503;
const HTTP_RATE_LIMITED_STATUS = 429;
const ASSIGNMENT_BUSY_LABEL = "Wait a moment before another desk request.";
const MIN_MAP_VERSION_COUNT = 1;
const AUTH_REQUIRED_LABEL = "Authentication required.";
const INVALID_ASSIGNMENT_LABEL = "Invalid desk assignment request.";
const ASSIGNMENT_UNAVAILABLE_LABEL = "Desk administration is unavailable. Reload and try again.";
type Handler = (request: HttpRequest, response: HttpResponse) => Promise<void>;
type App = { get(path: string, handler: Handler): unknown; post(path: string, handler: Handler): unknown };
type Dependencies = { session: typeof requestSession; service: Pick<DeskAssignmentService, "list" | "change">; tokens: DeskAssignmentRequests; actors: DeskAssignmentRequests };

function fail(response: HttpResponse, error: unknown) {
  if (error instanceof DeskAssignmentError) {
    const status = { invalid: HTTP_BAD_REQUEST_STATUS, forbidden: HTTP_FORBIDDEN_STATUS, conflict: HTTP_CONFLICT_STATUS, unavailable: HTTP_UNAVAILABLE_STATUS }[error.code];
    response.status(status).json({ code: error.code, error: error.message });
    return;
  }
  logServerError("api", "desk.assignment.failed", new Error(ASSIGNMENT_UNAVAILABLE_LABEL));
  response.status(HTTP_UNAVAILABLE_STATUS).json({ code: "unavailable", error: ASSIGNMENT_UNAVAILABLE_LABEL });
}

function busy(response: HttpResponse) {
  response.status(HTTP_RATE_LIMITED_STATUS).json({ code: "unavailable", error: ASSIGNMENT_BUSY_LABEL });
}

async function authenticated(write: boolean, request: HttpRequest, response: HttpResponse, dependencies: Dependencies, sessionToken: string) {
  const session = await dependencies.session(request);
  if (!session) { response.status(HTTP_UNAUTHORIZED_STATUS).json({ code: "forbidden", error: AUTH_REQUIRED_LABEL }); return; }
  if (!dependencies.actors.acquire(session.username)) { busy(response); return; }
  try {
    const officeId = request.params.officeId;
    if (!isOfficeDesksChanged({ officeId, configVersion: MIN_MAP_VERSION_COUNT }) || (write && !isOfficeDeskAssignmentCommand(request.body))) {
      response.status(HTTP_BAD_REQUEST_STATUS).json({ code: "invalid", error: INVALID_ASSIGNMENT_LABEL }); return;
    }
    const actor = { username: session.username, sessionToken };
    if (write && isOfficeDeskAssignmentCommand(request.body)) response.json(await dependencies.service.change(officeId, actor, request.body));
    else response.json(await dependencies.service.list(officeId, actor));
  } finally { dependencies.actors.release(session.username); }
}

function handler(write: boolean, dependencies: Dependencies): Handler {
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const sessionToken = sessionFromCookie(request.header("cookie"));
    if (!sessionToken) { response.status(HTTP_UNAUTHORIZED_STATUS).json({ code: "forbidden", error: AUTH_REQUIRED_LABEL }); return; }
    const key = tokenHash(sessionToken);
    if (!dependencies.tokens.acquire(key)) { busy(response); return; }
    try { await authenticated(write, request, response, dependencies, sessionToken); }
    catch (error) { fail(response, error); }
    finally { dependencies.tokens.release(key); }
  };
}

export function registerDeskAssignmentEndpoints(app: App, overrides: Partial<Dependencies> = {}) {
  const dependencies = { session: requestSession, service: new DeskAssignmentService(), tokens: new DeskAssignmentRequests(), actors: new DeskAssignmentRequests(), ...overrides };
  app.get("/offices/:officeId/desks/assignments", handler(false, dependencies));
  app.post("/offices/:officeId/desks/assignments", handler(true, dependencies));
}
