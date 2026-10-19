import { OfficeShareLinks } from "../offices/shareLinks.js";
import { errorMessage, requestSession, type HttpRequest, type HttpResponse } from "./middleware.js";

const HTTP_CREATED_STATUS = 201;
const HTTP_NO_CONTENT_STATUS = 204;
const HTTP_UNAUTHORIZED_STATUS = 401;
const HTTP_FORBIDDEN_STATUS = 403;
const AUTHENTICATION_REQUIRED_LABEL = "Authentication required.";
type Handler = (request: HttpRequest, response: HttpResponse) => Promise<void>;
type ShareApp = { get(path: string, handler: Handler): unknown; post(path: string, handler: Handler): unknown; delete(path: string, handler: Handler): unknown };
type Dependencies = { store: OfficeShareLinks; session: typeof requestSession };
type Action = "create" | "list" | "revoke" | "accept";
function handler(action: Action, dependencies: Dependencies): Handler {
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const session = await dependencies.session(request);
    if (!session) { response.status(HTTP_UNAUTHORIZED_STATUS).json({ error: AUTHENTICATION_REQUIRED_LABEL }); return; }
    try { await respond(action, dependencies.store, session.username, request, response); }
    catch (error) { response.status(HTTP_FORBIDDEN_STATUS).json({ error: errorMessage(error) }); }
  };
}
async function respond(action: Action, store: OfficeShareLinks, username: string, request: HttpRequest, response: HttpResponse) {
  const officeId = request.params.officeId!;
  switch (action) {
    case "create": response.status(HTTP_CREATED_STATUS).json({ link: await store.create(username, officeId) }); break;
    case "list": response.json({ links: await store.list(username, officeId) }); break;
    case "revoke": await store.revoke(username, officeId, request.params.linkId!); response.sendStatus(HTTP_NO_CONTENT_STATUS); break;
    case "accept": response.json({ officeId: await store.accept(username, request.body) }); break;
  }
}
export function registerShareLinkEndpoints(app: ShareApp, overrides: Partial<Dependencies> = {}) {
  const dependencies = { store: new OfficeShareLinks(), session: requestSession, ...overrides };
  app.post("/offices/:officeId/share-links", handler("create", dependencies));
  app.get("/offices/:officeId/share-links", handler("list", dependencies));
  app.delete("/offices/:officeId/share-links/:linkId", handler("revoke", dependencies));
  app.post("/office-invites/share-links/accept", handler("accept", dependencies));
}
