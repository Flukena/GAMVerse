import { spotlightTokenEndpoint } from "./spotlightEndpoint.js";
import { defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { getSession } from "../auth/service.js";
import { database, databaseIsReady, initializeDatabase } from "../infra/db.js";
import { getRecentServerErrorCount, logServerError, logServerEvent } from "../infra/logger.js";
import { hasValidInternalServiceToken } from "../infra/internalServiceAuth.js";
import { OfficeRoom, closeOfficeRooms, kickAccountFromOffices, kickOfficeMember, officeRoomDefinition } from "../offices/OfficeRoom.js";
import { getOfficeRole } from "../offices/repository.js";
import { createMeetingAudioToken, createPrivateVoiceToken, createProximityAudioToken, liveKitIdentity, muteVoiceParticipantTracks, voiceRoomNameForModeration } from "../media/service.js";
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
      app.post("/media/moderate", async (request: AuthRequest, response: AuthResponse) => {
        const sessionToken = sessionFromCookie(request.header("cookie"));
        const session = await getSession(sessionToken);
        if (!session || !sessionToken) { response.status(401).json({ error: "Authentication required." }); return; }
        const officeId = request.body?.officeId;
        const rawSource: unknown = request.body?.source;
        const sources = ["microphone", "camera", "screen_share"] as const;
        if (typeof rawSource !== "string" || !sources.includes(rawSource as (typeof sources)[number])) {
          response.status(400).json({ error: "Office and a valid media source are required." }); return;
        }
        const source = rawSource as (typeof sources)[number];
        const muteAll = request.body?.all === true;
        const rawTargetUsername: unknown = request.body?.targetUsername;
        if (typeof officeId !== "string") {
          response.status(400).json({ error: "Office and a valid media source are required." }); return;
        }
        if (!muteAll && (typeof rawTargetUsername !== "string" || !rawTargetUsername.trim() || rawTargetUsername.length > 64)) {
          response.status(400).json({ error: "A target username is required." }); return;
        }
        const targetUsername = typeof rawTargetUsername === "string" ? rawTargetUsername : undefined;
        const role = await getOfficeRole(session.username, officeId, session.role === "maintainer");
        if (!role) { response.status(403).json({ error: "You are not a member of this office." }); return; }
        if (muteAll && role !== "owner" && role !== "admin" && role !== "maintainer") {
          response.status(403).json({ error: "Only office admins can mute everyone in a voice zone." }); return;
        }
        if (!muteAll && targetUsername === session.username) {
          response.status(400).json({ error: "Use your own media controls to manage your microphone or camera." }); return;
        }
        const voiceContext = OfficeRoom.getVoiceRoomForModeration(officeId, session.username, liveKitIdentity(session.username, sessionToken), muteAll ? undefined : targetUsername);
        if (!voiceContext || voiceContext.participantIdentities.length === 0) {
          response.status(403).json({ error: "The target is no longer in your voice zone." }); return;
        }
        try {
          const roomName = voiceRoomNameForModeration(officeId, voiceContext.kind, voiceContext.id);
          const mutedTracks = await muteVoiceParticipantTracks(roomName, voiceContext.participantIdentities, source);
          if (mutedTracks === 0) { response.status(409).json({ error: "No active track of that type was found in this voice zone." }); return; }
          logServerEvent("realtime", muteAll ? "voice.zone.media.muted" : "voice.participant.media.muted", {
            officeId,
            actorUsername: session.username,
            targetUsername: muteAll ? undefined : targetUsername,
            zoneKind: voiceContext.kind,
            source,
            mutedTracks,
          });
          response.json({ mutedTracks });
        } catch (error) { response.status(503).json({ error: "Could not mute media in this voice zone." }); }
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
  return hasValidInternalServiceToken(request.header("x-internal-service-token"), serviceToken);
}
