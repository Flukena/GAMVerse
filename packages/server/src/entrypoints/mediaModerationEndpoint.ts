import { isVoiceModerationRequest } from "@gammyverse/shared";
import { getOfficeRole } from "../offices/repository.js";
import { OfficeRoom } from "../offices/OfficeRoom.js";
import { liveKitIdentity, muteVoiceParticipantTracks } from "../media/service.js";
import { requestSession, sessionFromCookie, type HttpRequest, type HttpResponse } from "../http/middleware.js";
import { logServerError } from "../infra/logger.js";

const HTTP_UNAUTHORIZED_STATUS = 401;
const HTTP_BAD_REQUEST_STATUS = 400;
const HTTP_FORBIDDEN_STATUS = 403;
const HTTP_CONFLICT_STATUS = 409;
const HTTP_UNAVAILABLE_STATUS = 503;
const AUTH_REQUIRED_LABEL = "Authentication required.";
const INVALID_MODERATION_LABEL = "Office and a valid media source and target are required.";
const MODERATION_DENIED_LABEL = "The target is no longer in your voice zone or your access changed.";
const MODERATION_FAILED_LABEL = "Could not mute media in this voice zone.";
const SELF_MODERATION_LABEL = "Use your own media controls to manage your microphone or camera.";
const NO_TRACK_LABEL = "No active track of that type was found in this voice zone.";
type Dependencies = {
  session: typeof requestSession;
  role: typeof getOfficeRole;
  context: typeof OfficeRoom.getVoiceRoomForModeration;
  mute: typeof muteVoiceParticipantTracks;
};
function canModerate(role: string | null, all: boolean) {
  return !!role && (!all || role === "owner" || role === "admin" || role === "maintainer");
}

type ModerationContext = NonNullable<Awaited<ReturnType<Dependencies["context"]>>>;
function sameContext(before: ModerationContext, after: ModerationContext | null): after is ModerationContext {
  return !!after && before.kind === after.kind && before.id === after.id && before.roomName === after.roomName
    && JSON.stringify([...before.participantIdentities].sort()) === JSON.stringify([...after.participantIdentities].sort());
}

export function createMediaModerationEndpoint(overrides: Partial<Dependencies> = {}) {
  const dependencies = { session: requestSession, role: getOfficeRole, context: OfficeRoom.getVoiceRoomForModeration, mute: muteVoiceParticipantTracks, ...overrides };
  return async (request: HttpRequest, response: HttpResponse) => {
    try {
      const session = await dependencies.session(request);
      const token = sessionFromCookie(request.header("cookie"));
      if (!session || !token) { response.status(HTTP_UNAUTHORIZED_STATUS).json({ error: AUTH_REQUIRED_LABEL }); return; }
      if (!isVoiceModerationRequest(request.body)) { response.status(HTTP_BAD_REQUEST_STATUS).json({ error: INVALID_MODERATION_LABEL }); return; }
      const command = request.body;
      const all = command.all === true;
      if (!all && command.targetUsername === session.username) { response.status(HTTP_BAD_REQUEST_STATUS).json({ error: SELF_MODERATION_LABEL }); return; }
      const role = await dependencies.role(session.username, command.officeId, session.role === "maintainer");
      if (!canModerate(role, all)) { response.status(HTTP_FORBIDDEN_STATUS).json({ error: MODERATION_DENIED_LABEL }); return; }
      const context = await dependencies.context(command.officeId, session.username, liveKitIdentity(session.username, token), all ? undefined : command.targetUsername);
      const freshSession = await dependencies.session(request);
      if (!freshSession || freshSession.username !== session.username) { response.status(HTTP_FORBIDDEN_STATUS).json({ error: MODERATION_DENIED_LABEL }); return; }
      const freshRole = await dependencies.role(freshSession.username, command.officeId, freshSession.role === "maintainer");
      if (!context || !context.participantIdentities.length || !canModerate(freshRole, all)) { response.status(HTTP_FORBIDDEN_STATUS).json({ error: MODERATION_DENIED_LABEL }); return; }
      const current = await dependencies.context(command.officeId, session.username, liveKitIdentity(session.username, token), all ? undefined : command.targetUsername);
      if (!sameContext(context, current)) { response.status(HTTP_FORBIDDEN_STATUS).json({ error: MODERATION_DENIED_LABEL }); return; }
      const mutedTracks = await dependencies.mute(current.roomName, current.participantIdentities, command.source);
      if (!mutedTracks) { response.status(HTTP_CONFLICT_STATUS).json({ error: NO_TRACK_LABEL }); return; }
      response.json({ mutedTracks });
    } catch {
      logServerError("realtime", "voice.media.moderation.failed", new Error(MODERATION_FAILED_LABEL));
      response.status(HTTP_UNAVAILABLE_STATUS).json({ error: MODERATION_FAILED_LABEL });
    }
  };
}
export const mediaModerationEndpoint = createMediaModerationEndpoint();
