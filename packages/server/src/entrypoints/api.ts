import express from "express";
import { createServer } from "node:http";
import { readRoomLayout } from "@gammyverse/shared";
import { changeAccountPassword, completePasswordReset, createPasswordResetLink, getSession, listAccountsForMaintainer, loginAccount, pruneInactiveAccounts, registerAccount, revokeSession, setAccountSuspended, updateAccountCharacter, updateAccountNickname } from "../auth/service.js";
import { deleteUserCharacterModel, getCharacterModel, listUserCharacterModels, uploadUserCharacterModel } from "../auth/characterModels.js";
import { database, databaseIsReady, initializeDatabase } from "../infra/db.js";
import { listMaintainerAuditEvents } from "../infra/audit.js";
import { getRecentServerErrorCount, logServerError, logServerEvent } from "../infra/logger.js";
import { getPlatformOperationsCounts } from "../infra/operations.js";
import { listOfficeActivity, startOfficeActivityCleanup } from "../offices/activity.js";
import { MAX_OFFICE_MAP_REQUEST_BYTES, MAX_OFFICE_PROPS_REQUEST_BYTES } from "../offices/limits.js";
import { acceptOfficeInvite, claimOfficeDeskZone, createOffice, createOfficeInvite, deleteOffice, getOfficeMapLayout, getOfficeMembers, getOfficeProps, getOfficeRole, listInvites, listOffices, OfficeMapVersionConflict, OfficePropsVersionConflict, pruneInactiveOffices, removeOfficeMember, saveOfficeMapLayout, saveOfficeProps, setOfficeMemberRole, unclaimOfficeDeskZone, updateOfficeName } from "../offices/repository.js";
import { errorMessage, jsonBodyParser, originGuard, requestSession, sessionFromCookie, type HttpRequest as AuthRequest, type HttpResponse as AuthResponse, type Next } from "../http/middleware.js";

const port = Number(process.env.API_PORT ?? 2568);
const clientOrigins = new Set((process.env.CLIENT_ORIGIN ?? "http://localhost:5173").split(",").map((origin) => origin.trim()).filter(Boolean));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("API_PORT must be a valid port.");
const app: any = express();
const server = createServer(app);
configureApi();

function summarizeOfficeProps(value: unknown) {
  const props = typeof value === "object" && value !== null && "props" in value && Array.isArray((value as { props?: unknown }).props)
    ? (value as { props: unknown[] }).props
    : [];
  const assetCounts: Record<string, number> = {};
  let malformedAssetCount = 0;
  let omittedAssetKinds = 0;
  for (const prop of props) {
    if (typeof prop !== "object" || prop === null || !("asset" in prop) || typeof prop.asset !== "string" || prop.asset.length === 0) {
      malformedAssetCount += 1;
      continue;
    }
    const asset = prop.asset.slice(0, 128);
    if (asset in assetCounts) assetCounts[asset] += 1;
    else if (Object.keys(assetCounts).length < 40) assetCounts[asset] = 1;
    else omittedAssetKinds += 1;
  }
  return {
    propCount: props.length,
    malformedAssetCount,
    omittedAssetKinds,
    assetCounts: JSON.stringify(assetCounts),
  };
}

function isCharacterModelUpload(request: AuthRequest) {
  return request.method === "POST" && request.path.replace(/\/+$/, "") === "/auth/models";
}

function configureApi() {
      app.use(originGuard(clientOrigins, ["/auth", "/offices", "/office-invites", "/maintainer", "/media"], ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]));
      app.use((request: AuthRequest, response: AuthResponse, next: Next) => {
        const isCharacterUpload = isCharacterModelUpload(request);
        const requestLimit = request.path.endsWith("/props") ? MAX_OFFICE_PROPS_REQUEST_BYTES : request.path.endsWith("/map") ? MAX_OFFICE_MAP_REQUEST_BYTES : 8_192;
        if (!isCharacterUpload && ["/auth", "/offices", "/office-invites", "/maintainer", "/media"].some((path) => request.path.startsWith(path)) && Number(request.headers["content-length"] ?? 0) > requestLimit) {
          response.status(413).json({ error: "Request is too large." });
          return;
        }
        next();
      });
      app.use(["/auth", "/offices", "/office-invites", "/maintainer", "/media"], jsonBodyParser({
        methods: ["POST", "PATCH", "PUT"],
        maxBytes: (request) => request.path.endsWith("/props") ? MAX_OFFICE_PROPS_REQUEST_BYTES : request.path.endsWith("/map") ? MAX_OFFICE_MAP_REQUEST_BYTES : 8_192,
        // Express trims the mounted `/auth` prefix from `request.path` inside this middleware.
        skip: (request) => request.method === "POST" && ["/models", "/auth/models"].includes(request.path.replace(/\/+$/, "")),
      }));
      app.post("/auth/register", async (request: AuthRequest, response: AuthResponse) => {
        const result = await registerAccount(request.body?.username, request.body?.password, request.body?.email);
        if ("error" in result) response.status(400).json(result);
        else {
          setSessionCookie(response, result.sessionToken);
          response.status(201).json({ user: result.user });
        }
      });
      app.post("/auth/password/reset", async (request: AuthRequest, response: AuthResponse) => {
        response.setHeader("Referrer-Policy", "no-referrer");
        const result = await completePasswordReset(request.body?.token, request.body?.password);
        if ("error" in result) response.status(400).json(result);
        else response.json({ ok: true });
      });
      app.post("/auth/password/change", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        const result = await changeAccountPassword(session.username, request.body?.currentPassword, request.body?.newPassword);
        if ("error" in result) response.status(400).json(result);
        else { setSessionCookie(response, result.sessionToken); response.json({ user: result.user }); }
      });
      app.get("/maintainer/users", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session || session.role !== "maintainer") { response.status(403).json({ error: "Maintainer access required." }); return; }
        response.json({ users: await listAccountsForMaintainer() });
      });
      app.patch("/maintainer/users/:username/suspension", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session || session.role !== "maintainer") { response.status(403).json({ error: "Maintainer access required." }); return; }
        if (typeof request.body?.suspended !== "boolean") { response.status(400).json({ error: "Suspension status must be true or false." }); return; }
        try {
          const result = await setAccountSuspended(session.username, request.params.username, request.body.suspended);
          if ("error" in result) response.status(400).json(result);
          else {
            response.setHeader("Cache-Control", "no-store");
            if (request.body.suspended) {
              try { await notifyRealtime("members/kick-account", { username: request.params.username }); }
              catch {
                response.status(503).json({ ...result, activeSessionsDisconnected: false, error: "Account is suspended, but active connections could not be closed. Retry after realtime recovers." });
                return;
              }
            }
            response.json(request.body.suspended ? { ...result, activeSessionsDisconnected: true } : result);
          }
        } catch (error) { response.status(503).json({ error: errorMessage(error) }); }
      });
      app.get("/maintainer/audit", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session || session.role !== "maintainer") { response.status(403).json({ error: "Maintainer access required." }); return; }
        const limitValue = typeof request.query?.limit === "string" ? Number(request.query.limit) : undefined;
        const offsetValue = typeof request.query?.offset === "string" ? Number(request.query.offset) : 0;
        if ((limitValue !== undefined && (!Number.isInteger(limitValue) || limitValue < 1))
          || !Number.isInteger(offsetValue) || offsetValue < 0) {
          response.status(400).json({ error: "Audit pagination values are invalid." });
          return;
        }
        response.setHeader("Cache-Control", "no-store");
        try {
          response.json({ events: await listMaintainerAuditEvents({
            limit: limitValue,
            offset: Math.min(offsetValue, 9_999),
            action: typeof request.query?.action === "string" ? request.query.action : undefined,
            targetType: typeof request.query?.targetType === "string" ? request.query.targetType : undefined,
            targetId: typeof request.query?.targetId === "string" ? request.query.targetId : undefined,
          }) });
        } catch (error) { response.status(503).json({ error: errorMessage(error) }); }
      });
      app.get("/maintainer/overview", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session || session.role !== "maintainer") { response.status(403).json({ error: "Maintainer access required." }); return; }
        response.setHeader("Cache-Control", "no-store");
        let databaseReady = false;
        let counts: Awaited<ReturnType<typeof getPlatformOperationsCounts>> | null = null;
        if (database) {
          try {
            await databaseIsReady();
            databaseReady = true;
            counts = await getPlatformOperationsCounts();
          } catch {
            databaseReady = false;
            counts = null;
          }
        }
        const realtime = await getRealtimeOperationsOverview();
        response.json({
          generatedAt: new Date().toISOString(),
          services: {
            api: { status: "ready" },
            database: { status: databaseReady ? "ready" : "unavailable" },
            realtime: {
              status: realtime.ready ? "ready" : "unavailable",
              activeRooms: realtime.activeRoomCount,
              activeParticipants: realtime.activeParticipantCount,
            },
          },
          counts: counts ? {
            accounts: counts.accounts,
            suspendedAccounts: counts.suspendedAccounts,
            offices: counts.offices,
            activeOffices: counts.activeOffices,
            officeActivity24h: counts.officeActivityLast24Hours,
          } : null,
          recentErrors: {
            windowMinutes: 15,
            count: getRecentServerErrorCount() + (realtime.recentErrorCount ?? 0),
            complete: realtime.recentErrorCount !== null,
          },
        });
      });
      app.post("/maintainer/users/:username/password-reset", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session || session.role !== "maintainer") { response.status(403).json({ error: "Maintainer access required." }); return; }
        const result = await createPasswordResetLink(session.username, request.params.username);
        if ("error" in result) response.status(400).json(result);
        else { response.setHeader("Cache-Control", "no-store"); response.status(201).json({ resetPath: `/reset/${result.token}`, expiresAt: result.expiresAt }); }
      });
      app.post("/auth/login", async (request: AuthRequest, response: AuthResponse) => {
        const result = await loginAccount(request.body?.username, request.body?.password, "user");
        if ("error" in result) response.status(401).json(result);
        else {
          setSessionCookie(response, result.sessionToken);
          response.json({ user: result.user });
        }
      });
      app.post("/auth/maintainer/login", async (request: AuthRequest, response: AuthResponse) => {
        const result = await loginAccount(request.body?.username, request.body?.password, "maintainer");
        if ("error" in result) response.status(401).json(result);
        else {
          setSessionCookie(response, result.sessionToken);
          response.json({ user: result.user });
        }
      });
      app.get("/auth/me", async (request: AuthRequest, response: AuthResponse) => {
        const user = await getSession(sessionFromCookie(request.header("cookie")));
        if (!user) response.status(401).json({ error: "Session expired. Please sign in again." });
        else response.json({ user });
      });
      app.patch("/auth/character", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          const result = await updateAccountCharacter(session.username, request.body?.characterId);
          if ("error" in result) response.status(400).json(result);
          else response.json(result);
        } catch (error) {
          console.error("Could not save account character.", error);
          response.status(500).json({ error: "Could not save your character." });
        }
      });
      app.patch("/auth/nickname", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          const result = await updateAccountNickname(session.username, request.body?.nickname);
          if ("error" in result) response.status(400).json(result);
          else response.json(result);
        } catch (error) {
          console.error("Could not save account nickname.", error);
          response.status(500).json({ error: "Could not save your nickname." });
        }
      });
      app.get("/auth/models", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try { response.setHeader("Cache-Control", "no-store"); response.json({ models: await listUserCharacterModels(session.username) }); }
        catch (error) { response.status(503).json({ error: errorMessage(error) }); }
      });
      app.post("/auth/models", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        if (!/^application\/(octet-stream|vnd\.gltf-binary)(?:\s*;|$)/i.test(request.header("content-type") ?? "")) {
          response.status(415).json({ error: "Upload one binary glTF 2.0 GLB file." }); return;
        }
        const length = Number(request.headers["content-length"] ?? 0);
        if (length > 10 * 1024 * 1024) { response.status(413).json({ error: "Model must be no larger than 10 MiB." }); return; }
        try {
          const bytes = await readLimitedBody(request, 10 * 1024 * 1024);
          const result = await uploadUserCharacterModel(session.username, request.header("x-model-name"), bytes);
          if ("error" in result) response.status(result.error?.startsWith("You can store") ? 413 : 400).json(result);
          else { response.setHeader("Cache-Control", "no-store"); response.status(201).json(result); }
        } catch (error) { response.status(error instanceof RequestTooLargeError ? 413 : 503).json({ error: errorMessage(error) }); }
      });
      app.delete("/auth/models/:modelId", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          const result = await deleteUserCharacterModel(session.username, request.params.modelId);
          if ("error" in result) response.status(404).json(result);
          else response.sendStatus(204);
        } catch (error) { response.status(503).json({ error: errorMessage(error) }); }
      });
      // Opaque UUID URLs let other clients render a player's avatar; only its owner
      // can list, upload, delete, or select the model.
      app.get("/auth/models/:modelId/model", async (request: AuthRequest, response: AuthResponse) => {
        try {
          const model = await getCharacterModel(request.params.modelId);
          if (!model) { response.sendStatus(404); return; }
          response.setHeader("Content-Type", "model/gltf-binary");
          response.setHeader("Content-Length", String(model.bytes.length));
          response.setHeader("Cache-Control", "public, max-age=300");
          response.setHeader("X-Content-Type-Options", "nosniff");
          response.send(model.bytes);
        } catch (error) { response.status(503).json({ error: errorMessage(error) }); }
      });
      app.post("/auth/logout", async (request: AuthRequest, response: AuthResponse) => {
        await revokeSession(sessionFromCookie(request.header("cookie")));
        response.clearCookie("gv_session", cookieOptions());
        response.sendStatus(204);
      });
      app.get("/offices", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        response.json({ offices: await listOffices(session.username, session.role === "maintainer"), invites: await listInvites(session.username) });
      });
      app.post("/offices", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try { response.status(201).json({ office: await createOffice(session.username, request.body?.name) }); }
        catch (error) { response.status(400).json({ error: errorMessage(error) }); }
      });
      app.delete("/offices/:officeId", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          await deleteOffice(session.username, session.role === "maintainer", request.params.officeId);
          await notifyRealtime("offices/close", { officeId: request.params.officeId });
          response.sendStatus(204);
        } catch (error) {
          const message = errorMessage(error);
          response.status(message === "Office not found." ? 404 : message.startsWith("Only the office owner") ? 403 : 503).json({ error: message });
        }
      });
      app.get("/offices/:officeId", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try { response.json(await getOfficeMembers(session.username, request.params.officeId, session.role === "maintainer")); }
        catch (error) { response.status(403).json({ error: errorMessage(error) }); }
      });
      app.get("/offices/:officeId/activity", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          const role = await getOfficeRole(session.username, request.params.officeId, session.role === "maintainer");
          if (!role) { response.status(403).json({ error: "Office not found or access denied." }); return; }
          response.json({ activities: await listOfficeActivity(request.params.officeId) });
        } catch (error) { response.status(503).json({ error: errorMessage(error) }); }
      });
      app.get("/offices/:officeId/map", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          response.setHeader("Cache-Control", "no-store");
          response.json(await getOfficeMapLayout(session.username, request.params.officeId, session.role === "maintainer"));
        } catch (error) { response.status(403).json({ error: errorMessage(error) }); }
      });
      app.get("/offices/:officeId/props", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          response.setHeader("Cache-Control", "no-store");
          const snapshot = await getOfficeProps(session.username, request.params.officeId, session.role === "maintainer");
          logServerEvent("api", "office.props.loaded", {
            officeId: request.params.officeId,
            username: session.username,
            configVersion: snapshot.configVersion,
            ...summarizeOfficeProps(snapshot),
          });
          response.json(snapshot);
        } catch (error) {
          const message = errorMessage(error);
          logServerError("api", "office.props.load.failed", error, { officeId: request.params.officeId, username: session.username });
          response.status(message.includes("access denied") ? 403 : 503).json({ error: message });
        }
      });
      app.put("/offices/:officeId/props", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          const result = await saveOfficeProps(session.username, request.params.officeId, request.body, session.role === "maintainer");
          logServerEvent("api", "office.props.saved", {
            officeId: request.params.officeId,
            username: session.username,
            configVersion: result.configVersion,
            ...summarizeOfficeProps(result),
          });
          await notifyRealtime("offices/map", { officeId: request.params.officeId });
          response.setHeader("Cache-Control", "no-store");
          response.json(result);
        } catch (error) {
          if (error instanceof OfficePropsVersionConflict) {
            logServerEvent("api", "office.props.save.conflict", {
              officeId: request.params.officeId,
              username: session.username,
              requestedConfigVersion: typeof request.body?.configVersion === "number" ? request.body.configVersion : null,
              currentConfigVersion: error.latest.configVersion,
              ...summarizeOfficeProps(request.body),
            });
            response.setHeader("Cache-Control", "no-store");
            response.status(409).json({ error: error.message, ...error.latest });
            return;
          }
          const message = errorMessage(error);
          logServerError("api", "office.props.save.failed", error, {
            officeId: request.params.officeId,
            username: session.username,
            ...summarizeOfficeProps(request.body),
          });
          response.status(message.includes("access denied") ? 403 : message.includes("PostgreSQL") ? 503 : 400).json({ error: message });
        }
      });
      app.post("/offices/:officeId/desk-zones/:zoneId/claim", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          const result = await claimOfficeDeskZone(session.username, request.params.officeId, request.params.zoneId);
          const zone = readRoomLayout(result.config).zones.find((entry) => entry.id === request.params.zoneId);
          if (zone) await notifyRealtime("offices/desk-zone", { officeId: request.params.officeId, zoneId: zone.id, name: zone.name, ownerUsername: zone.ownerUsername ?? "" });
          logServerEvent("api", "desk.claimed", { officeId: request.params.officeId, zoneId: request.params.zoneId, username: session.username });
          response.setHeader("Cache-Control", "no-store");
          response.json(result);
        } catch (error) {
          const message = errorMessage(error);
          logServerError("api", "desk.claim.failed", error, { officeId: request.params.officeId, zoneId: request.params.zoneId, username: session.username });
          const status = message.includes("access denied") ? 403 : message.includes("PostgreSQL") ? 503 : message.includes("already") ? 409 : 400;
          response.status(status).json({ error: message });
        }
      });
      app.post("/offices/:officeId/desk-zones/:zoneId/unclaim", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          const result = await unclaimOfficeDeskZone(session.username, request.params.officeId, request.params.zoneId);
          const zone = readRoomLayout(result.config).zones.find((entry) => entry.id === request.params.zoneId);
          if (zone) await notifyRealtime("offices/desk-zone", { officeId: request.params.officeId, zoneId: zone.id, name: zone.name, ownerUsername: zone.ownerUsername ?? "" });
          logServerEvent("api", "desk.unclaimed", { officeId: request.params.officeId, zoneId: request.params.zoneId, username: session.username });
          response.setHeader("Cache-Control", "no-store");
          response.json(result);
        } catch (error) {
          const message = errorMessage(error);
          logServerError("api", "desk.unclaim.failed", error, { officeId: request.params.officeId, zoneId: request.params.zoneId, username: session.username });
          const status = message.includes("access denied") || message.includes("Only the desk owner") ? 403 : message.includes("PostgreSQL") ? 503 : 400;
          response.status(status).json({ error: message });
        }
      });
      app.put("/offices/:officeId/map", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          const result = await saveOfficeMapLayout(session.username, session.role === "maintainer", request.params.officeId, request.body);
          await notifyRealtime("offices/map", { officeId: request.params.officeId });
          response.setHeader("Cache-Control", "no-store");
          response.json(result);
        } catch (error) {
          if (error instanceof OfficeMapVersionConflict) {
            response.setHeader("Cache-Control", "no-store");
            response.status(409).json({ error: error.message, ...error.latest });
            return;
          }
          const message = errorMessage(error);
          response.status(message.startsWith("Only office owners and admins") || message.includes("access denied") ? 403 : message.includes("PostgreSQL") ? 503 : 400).json({ error: message });
        }
      });
      app.patch("/offices/:officeId", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          response.json({ name: await updateOfficeName(session.username, session.role === "maintainer", request.params.officeId, request.body?.name) });
        } catch (error) { response.status(403).json({ error: errorMessage(error) }); }
      });
      app.post("/offices/:officeId/invites", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          response.status(201).json({ invite: await createOfficeInvite(session.username, session.role === "maintainer", request.params.officeId, request.body?.username, request.body?.role) });
        } catch (error) { response.status(403).json({ error: errorMessage(error) }); }
      });
      app.patch("/offices/:officeId/members/:username", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          await setOfficeMemberRole(session.username, session.role === "maintainer", request.params.officeId, request.params.username, request.body?.role);
          await notifyRealtime("members/kick", { officeId: request.params.officeId, username: request.params.username });
          response.sendStatus(204);
        } catch (error) { response.status(403).json({ error: errorMessage(error) }); }
      });
      app.delete("/offices/:officeId/members/:username", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try {
          await removeOfficeMember(session.username, session.role === "maintainer", request.params.officeId, request.params.username);
          await notifyRealtime("members/kick", { officeId: request.params.officeId, username: request.params.username });
          await notifyRealtime("offices/map", { officeId: request.params.officeId });
          response.sendStatus(204);
        } catch (error) { response.status(403).json({ error: errorMessage(error) }); }
      });
      app.post("/office-invites/accept", async (request: AuthRequest, response: AuthResponse) => {
        const session = await requestSession(request);
        if (!session) { response.status(401).json({ error: "Authentication required." }); return; }
        try { response.json({ officeId: await acceptOfficeInvite(session.username, request.body?.token ?? request.body?.inviteId) }); }
        catch (error) { response.status(400).json({ error: errorMessage(error) }); }
      });
  app.get("/health/live", (_request: AuthRequest, response: AuthResponse) => response.json({ status: "ok", service: "api" }));
  app.get("/health/ready", async (_request: AuthRequest, response: AuthResponse) => {
    try { await databaseIsReady(); response.json({ status: "ready", service: "api" }); }
    catch { response.status(503).json({ status: "unavailable", service: "api" }); }
  });
}

async function startApi() {
  await initializeDatabase();
  startOfficeActivityCleanup();
  await importLegacyAccountsIfRequested();
  const deletedOffices = await pruneInactiveOffices();
  if (deletedOffices.length > 0) console.info("Removed " + deletedOffices.length + " inactive office(s).");
  const deletedAccounts = await pruneInactiveAccounts();
  if (deletedAccounts.length > 0) console.info("Removed " + deletedAccounts.length + " inactive account(s).");
  setInterval(() => {
    void pruneInactiveOffices().then((removed) => { if (removed.length > 0) console.info("Removed " + removed.length + " inactive office(s)."); }).catch(() => console.error("Inactive office cleanup failed."));
    void pruneInactiveAccounts().then((removed) => { if (removed.length > 0) console.info("Removed " + removed.length + " inactive account(s)."); }).catch(() => console.error("Inactive account cleanup failed."));
  }, 60 * 60 * 1000);
  server.listen(port, "0.0.0.0", () => logServerEvent("api", "service.listening", { port, nodeEnv: process.env.NODE_ENV ?? "development" }));
}

async function notifyRealtime(action: string, body: Record<string, string>) {
  const baseUrl = process.env.REALTIME_INTERNAL_URL;
  const serviceToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (!baseUrl || !serviceToken) throw new Error("Realtime service control is not configured.");
  const startedAt = performance.now();
  try {
    const response = await fetch(baseUrl.replace(/\/$/, "") + "/internal/" + action, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Internal-Service-Token": serviceToken },
      body: JSON.stringify(body), signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error(`Realtime control request failed with HTTP ${response.status}.`);
    logServerEvent("api", "realtime.control.completed", { action, officeId: body.officeId, durationMs: Math.round(performance.now() - startedAt) });
  } catch (error) {
    logServerError("api", "realtime.control.failed", error, { action, officeId: body.officeId, durationMs: Math.round(performance.now() - startedAt) });
    throw error;
  }
}

type RealtimeOperationsOverview = {
  ready: boolean;
  activeRoomCount: number | null;
  activeParticipantCount: number | null;
  recentErrorCount: number | null;
};

async function getRealtimeOperationsOverview(): Promise<RealtimeOperationsOverview> {
  const baseUrl = process.env.REALTIME_INTERNAL_URL;
  const serviceToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (!baseUrl || !serviceToken) return { ready: false, activeRoomCount: null, activeParticipantCount: null, recentErrorCount: null };
  try {
    const result = await fetch(baseUrl.replace(/\/$/, "") + "/internal/operations/metrics", {
      headers: { "X-Internal-Service-Token": serviceToken },
      signal: AbortSignal.timeout(2_000),
    });
    if (!result.ok) return { ready: false, activeRoomCount: null, activeParticipantCount: null, recentErrorCount: null };
    const payload: unknown = await result.json();
    if (typeof payload !== "object" || payload === null) return { ready: false, activeRoomCount: null, activeParticipantCount: null, recentErrorCount: null };
    const metrics = payload as Record<string, unknown>;
    const safeCount = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
    const activeRoomCount = safeCount(metrics.activeRoomCount);
    const activeParticipantCount = safeCount(metrics.activeParticipantCount);
    const recentErrorCount = safeCount(metrics.recentErrorCount);
    const metricsAvailable = activeRoomCount !== null && activeParticipantCount !== null && recentErrorCount !== null;
    return {
      ready: metrics.ready === true && metricsAvailable,
      activeRoomCount: metricsAvailable ? activeRoomCount : null,
      activeParticipantCount: metricsAvailable ? activeParticipantCount : null,
      recentErrorCount: metricsAvailable ? recentErrorCount : null,
    };
  } catch {
    return { ready: false, activeRoomCount: null, activeParticipantCount: null, recentErrorCount: null };
  }
}

function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 };
}

function setSessionCookie(response: AuthResponse, token: string) {
  response.cookie("gv_session", token, cookieOptions());
}

async function importLegacyAccountsIfRequested() {
  if (!process.env.IMPORT_LEGACY_AUTH || !process.env.DATABASE_URL) return;
  const { database } = await import("../infra/db.js");
  if (!database) return;
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const file = resolve(process.env.AUTH_USERS_FILE ?? "data/auth-users.json");
  let legacy: Array<{ username: string; salt: string; passwordHash: string; createdAt: string; lastActiveAt?: string }>;
  try {
    legacy = JSON.parse(await readFile(file, "utf8")) as typeof legacy;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("IMPORT_LEGACY_AUTH is enabled but the legacy auth file was not found.");
    throw error;
  }
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT flag FROM app_system_flags WHERE flag = 'legacy_auth_json_imported'");
    if (rows.length > 0) {
      await client.query("COMMIT");
      return;
    }
    for (const account of legacy) {
      await client.query(
        "INSERT INTO app_users(username, password_salt, password_hash, created_at, last_active_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT(username) DO NOTHING",
        [account.username, account.salt, account.passwordHash, account.createdAt, account.lastActiveAt ?? account.createdAt],
      );
    }
    await client.query("INSERT INTO app_system_flags(flag) VALUES ('legacy_auth_json_imported')");
    await client.query("COMMIT");
    console.info(`Imported ${legacy.length} legacy account record(s).`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

class RequestTooLargeError extends Error {
  constructor() { super("Model must be no larger than 10 MiB."); }
}

function readLimitedBody(request: AuthRequest, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) tooLarge = true;
      else chunks.push(chunk);
    });
    request.on("end", () => tooLarge ? reject(new RequestTooLargeError()) : resolve(Buffer.concat(chunks, size)));
    request.on("error", reject);
  });
}

void startApi().catch((error) => { logServerError("api", "startup.failed", error); process.exitCode = 1; });
