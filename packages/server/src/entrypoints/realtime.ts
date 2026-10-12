import { timingSafeEqual } from "node:crypto";
import { defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { getSession } from "../auth/service.js";
import { databaseIsReady, initializeDatabase } from "../infra/db.js";
import { logServerError, logServerEvent } from "../infra/logger.js";
import { OfficeRoom, closeOfficeRooms, kickOfficeMember, officeRoomDefinition } from "../offices/OfficeRoom.js";
import { getOfficeRole } from "../offices/repository.js";
import { createMeetingAudioToken, createPrivateVoiceToken, createProximityAudioToken, liveKitIdentity } from "../media/service.js";
import { errorMessage, jsonBodyParser, originGuard, sessionFromCookie, type HttpRequest as AuthRequest, type HttpResponse as AuthResponse } from "../http/middleware.js";

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
    app.post("/internal/offices/close", (request: AuthRequest, response: AuthResponse) => {
      if (!authorizedServiceCall(request)) { response.sendStatus(401); return; }
      const officeId = request.body?.officeId;
      if (typeof officeId !== "string") { response.status(400).json({ error: "Office id is required." }); return; }
      logServerEvent("realtime", "office.close.requested", { officeId });
      closeOfficeRooms(officeId); response.sendStatus(204);
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
    app.post("/internal/members/kick", (request: AuthRequest, response: AuthResponse) => {
      if (!authorizedServiceCall(request)) { response.sendStatus(401); return; }
      const officeId = request.body?.officeId; const username = request.body?.username;
      if (typeof officeId !== "string" || typeof username !== "string") { response.status(400).json({ error: "Office id and username are required." }); return; }
      logServerEvent("realtime", "office.member.kick.requested", { officeId, username });
      kickOfficeMember(officeId, username); response.sendStatus(204);
    });
      app.post("/media/meeting-token", async (request: AuthRequest, response: AuthResponse) => {
        const sessionToken = sessionFromCookie(request.header("cookie"));
        const session = await getSession(sessionToken);
        if (!session || !sessionToken) { response.status(401).json({ error: "Authentication required." }); return; }
        const officeId = request.body?.officeId;
        const roomKey = typeof request.body?.roomKey === "string" ? request.body.roomKey : "lobby";
        if (typeof officeId !== "string" || !OfficeRoom.isMeetingMember(officeId, session.username, liveKitIdentity(session.username, sessionToken), roomKey)) {
          response.status(403).json({ error: "Enter the meeting area to join its audio room." }); return;
        }
        try { response.json(await createMeetingAudioToken(session.username, liveKitIdentity(session.username, sessionToken), officeId, roomKey)); }
        catch (error) { response.status(503).json({ error: errorMessage(error) }); }
      });
      app.post("/media/private-token", async (request: AuthRequest, response: AuthResponse) => {
        const sessionToken = sessionFromCookie(request.header("cookie"));
        const session = await getSession(sessionToken);
        if (!session || !sessionToken) { response.status(401).json({ error: "Authentication required." }); return; }
        const officeId = request.body?.officeId;
        const zoneId = request.body?.zoneId;
        const identity = liveKitIdentity(session.username, sessionToken);
        if (typeof officeId !== "string" || typeof zoneId !== "string" || OfficeRoom.getPrivateVoiceZoneId(officeId, session.username, identity) !== zoneId) {
          response.status(403).json({ error: "Enter a private voice zone to join its audio channel." }); return;
        }
        try { response.json(await createPrivateVoiceToken(session.username, identity, officeId, zoneId)); }
        catch (error) { response.status(503).json({ error: errorMessage(error) }); }
      });
      app.post("/media/proximity-token", async (request: AuthRequest, response: AuthResponse) => {
        const sessionToken = sessionFromCookie(request.header("cookie"));
        const session = await getSession(sessionToken);
        if (!session || !sessionToken) { response.status(401).json({ error: "Authentication required." }); return; }
        const officeId = request.body?.officeId;
        if (typeof officeId !== "string") { response.status(400).json({ error: "Choose an office." }); return; }
        const identity = liveKitIdentity(session.username, sessionToken);
        const groupId = OfficeRoom.getProximityGroupId(officeId, session.username, identity);
        if (!groupId) { response.status(403).json({ error: "Move close to an office member to join nearby voice." }); return; }
        try {
          const token = await createProximityAudioToken(session.username, identity, officeId, groupId);
          if (OfficeRoom.getProximityGroupId(officeId, session.username, identity) !== groupId) {
            response.status(403).json({ error: "Your nearby voice group changed. Try again." }); return;
          }
          response.json({ ...token, groupId });
        } catch (error) { response.status(503).json({ error: errorMessage(error) }); }
      });
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
  const supplied = Buffer.from(request.header("x-internal-service-token") ?? "");
  const expected = Buffer.from(serviceToken);
  return expected.length >= 32 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
