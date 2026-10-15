import { DeskRepository } from "../offices/deskRepository.js";
import { errorMessage, requestSession, type HttpRequest, type HttpResponse } from "./middleware.js";

const HTTP_UNAUTHORIZED_STATUS = 401;
const HTTP_FORBIDDEN_STATUS = 403;
const HTTP_SERVICE_UNAVAILABLE_STATUS = 503;
const HTTP_CONFLICT_STATUS = 409;
const HTTP_BAD_REQUEST_STATUS = 400;
const AUTHENTICATION_REQUIRED_LABEL = "Authentication required.";
type DeskHandler = (request: HttpRequest, response: HttpResponse) => Promise<void>;
type DeskApp = { get(path: string, handler: DeskHandler): unknown; post(path: string, handler: DeskHandler): unknown };
type DeskEndpointDependencies = {
  session: typeof requestSession;
  store: Pick<DeskRepository, "list" | "change">;
  notify(officeId: string): Promise<unknown>;
};
function deskErrorStatus(message: string) {
  if (message.includes("access denied") || message.includes("Only the desk owner")) return HTTP_FORBIDDEN_STATUS;
  if (message.includes("PostgreSQL")) return HTTP_SERVICE_UNAVAILABLE_STATUS;
  return message.includes("already") ? HTTP_CONFLICT_STATUS : HTTP_BAD_REQUEST_STATUS;
}
function deskHandler(action: "list" | "claim" | "unclaim", dependencies: DeskEndpointDependencies): DeskHandler {
  return async (request, response) => {
    const session = await dependencies.session(request);
    if (!session) { response.status(HTTP_UNAUTHORIZED_STATUS).json({ error: AUTHENTICATION_REQUIRED_LABEL }); return; }
    try {
      const officeId = request.params.officeId!;
      const result = action === "list" ? await dependencies.store.list(session.username, officeId, session.role === "maintainer")
        : await dependencies.store.change(session.username, officeId, { deskId: request.params.deskId! }, action === "claim");
      if (action !== "list") await dependencies.notify(officeId);
      response.setHeader("Cache-Control", "no-store");
      response.json(result);
    } catch (error) { const message = errorMessage(error); response.status(deskErrorStatus(message)).json({ error: message }); }
  };
}
export function registerDeskEndpoints(app: DeskApp, notify: DeskEndpointDependencies["notify"], overrides: Partial<DeskEndpointDependencies> = {}) {
  const dependencies = { session: requestSession, store: new DeskRepository(), notify, ...overrides };
  app.get("/offices/:officeId/desks", deskHandler("list", dependencies));
  app.post("/offices/:officeId/desks/:deskId/claim", deskHandler("claim", dependencies));
  app.post("/offices/:officeId/desks/:deskId/unclaim", deskHandler("unclaim", dependencies));
}
