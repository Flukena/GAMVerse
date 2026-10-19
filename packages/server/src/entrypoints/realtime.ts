import { mediaModerationEndpoint } from "./mediaModerationEndpoint.js";
import { deskAssignmentControl } from "../http/deskAssignmentControl.js";
import { conversationTokenEndpoint } from "./conversationEndpoint.js";
import { spotlightTokenEndpoint } from "./spotlightEndpoint.js";
import { defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { database, databaseIsReady, initializeDatabase } from "../infra/db.js";
import { getRecentServerErrorCount, logServerError, logServerEvent } from "../infra/logger.js";
import { hasValidInternalServiceToken } from "../infra/internalServiceAuth.js";
import { OfficeRoom, closeOfficeRooms, kickAccountFromOffices, kickOfficeMember, officeRoomDefinition } from "../offices/OfficeRoom.js";
import { jsonBodyParser, originGuard, type HttpRequest as AuthRequest, type HttpResponse as AuthResponse } from "../http/middleware.js";

const port = Number(process.env.PORT ?? 2567);
const clientOrigins = new Set((process.env.CLIENT_ORIGIN ?? "http://localhost:5173").split(",").map((origin) => origin.trim()).filter(Boolean));
const serviceToken = process.env.INTERNAL_SERVICE_TOKEN ?? "";
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Realtime PORT must be a valid port.");
if (process.env.NODE_ENV === "production" && Buffer.byteLength(serviceToken) < 32) throw new Error("INTERNAL_SERVICE_TOKEN must contain at least 32 characters in production.");

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: { office: officeRoomDefinition },
  devMode: process.env.NODE_ENV !== "production",
  beforeListen: async () => { await initializeDatabase(); await databaseIsReady(); },
  express: (app: any) => {
    app.use(originGuard(clientOrigins, ["/auth", "/offices", "/office-invites", "/maintainer", "/media"], ["GET", "POST", "OPTIONS"]));
    app.use(["/media", "/internal"], jsonBodyParser({ methods: ["POST"], maxBytes: 8_192 }));
    app.post("/internal/offices/desk-assignment", deskAssignmentControl(serviceToken));
    app.post("/internal/offices/close", (request: AuthRequest, response: AuthResponse) => {
      if (!authorizedServiceCall(request)) { response.sendStatus(401); return; }
      const officeId = request.body?.officeId;
      if (typeof officeId !== "string") { response.status(400).json({ error: "Office id is required." }); return; }
      logServerEvent("realtime", "office.close.requested", { officeId });
      closeOfficeRooms(officeId); response.sendStatus(204);
    });
    app.post("/internal/members/kick-account", (request: AuthRequest, response: AuthResponse) => {
      if (!authorizedServiceCall(request)) { response.sendStatus(401); return; }
      const username = request.body?.username;
      if (typeof username !== "string" || !username) { response.status(400).json({ error: "Username is required." }); return; }
      const kickedClientCount = kickAccountFromOffices(username);
      logServerEvent("realtime", "account.sessions.kicked", { kickedClientCount });
      response.json({ kickedClientCount });
    });
    app.get("/internal/operations/metrics", async (request: AuthRequest, response: AuthResponse) => {
      if (!authorizedServiceCall(request)) { response.sendStatus(401); return; }
      response.setHeader("Cache-Control", "no-store");
      let ready = false;
      if (database) {
        try { await databaseIsReady(); ready = true; }
        catch { ready = false; }
      }
      const { activeRoomCount, activeParticipantCount } = OfficeRoom.getOperationsCounts();
      response.json({
        ready,
        activeRoomCount,
        activeParticipantCount,
        recentErrorCount: getRecentServerErrorCount(),
      });
    });
    app.post("/internal/offices/map", async (request: AuthRequest, response: AuthResponse) => {
      if (!authorizedServiceCall(request)) { response.sendStatus(401); return; }
      const officeId = request.body?.officeId;
      if (typeof officeId !== "string") { response.status(400).json({ error: "Office id is required." }); return; }
      try { await OfficeRoom.updateMap(officeId); response.sendStatus(204); }
      catch (error) {
        logServerError("realtime", "office.map.refresh.failed", error, { officeId });
        response.status(503).json({ error: "Could not refresh office map." });
      }
    });
    app.post("/internal/offices/desk-zone", (request: AuthRequest, response: AuthResponse) => {
      if (!authorizedServiceCall(request)) { response.sendStatus(401); return; }
      const officeId = request.body?.officeId;
      const zoneId = request.body?.zoneId;
      const name = request.body?.name;
      const ownerUsername = request.body?.ownerUsername;
      if (typeof officeId !== "string" || typeof zoneId !== "string" || typeof name !== "string"
        || typeof ownerUsername !== "string") {
        response.status(400).json({ error: "Office id, desk zone id, name, and owner are required." }); return;
      }
      OfficeRoom.updateDeskZone(officeId, { id: zoneId, name, ownerUsername: ownerUsername || null });
      response.sendStatus(204);
    });
    app.post("/internal/members/kick", (request: AuthRequest, response: AuthResponse) => {
      if (!authorizedServiceCall(request)) { response.sendStatus(401); return; }
      const officeId = request.body?.officeId; const username = request.body?.username;
      if (typeof officeId !== "string" || typeof username !== "string") { response.status(400).json({ error: "Office id and username are required." }); return; }
      logServerEvent("realtime", "office.member.kick.requested", { officeId, username });
      kickOfficeMember(officeId, username); response.sendStatus(204);
    });
      app.post("/media/spotlight-token", spotlightTokenEndpoint);
      app.post("/media/meeting-token", conversationTokenEndpoint("meeting"));
      app.post("/media/private-token", conversationTokenEndpoint("private"));
      app.post("/media/proximity-token", conversationTokenEndpoint("proximity"));
      app.post("/media/moderate", mediaModerationEndpoint);
    app.get("/health/live", (_request: AuthRequest, response: AuthResponse) => response.json({ status: "ok", service: "realtime" }));
    app.get("/health/ready", async (_request: AuthRequest, response: AuthResponse) => {
      try { await databaseIsReady(); response.json({ status: "ready", service: "realtime" }); }
      catch { response.status(503).json({ status: "unavailable", service: "realtime" }); }
    });
  },
});

server.listen(port);
logServerEvent("realtime", "service.listening", { port, nodeEnv: process.env.NODE_ENV ?? "development" });

function authorizedServiceCall(request: AuthRequest) {
  return hasValidInternalServiceToken(request.header("x-internal-service-token"), serviceToken);
}
