import { isSpatialMediaTokenRequest, type ConversationKind } from "@gammyverse/shared";
import { getSession } from "../auth/service.js";
import { getOfficeRole } from "../offices/repository.js";
import { OfficeRoom } from "../offices/OfficeRoom.js";
import { mintConversationGrant, ConversationAuthorizationError } from "../media/conversationGrant.js";
import { createMeetingAudioToken, createPrivateVoiceToken, createProximityAudioToken, liveKitIdentity } from "../media/service.js";
import { errorMessage, sessionFromCookie, type HttpRequest, type HttpResponse } from "../http/middleware.js";
const HTTP_BAD_REQUEST_STATUS = 400;
const HTTP_UNAUTHORIZED_STATUS = 401;
const HTTP_FORBIDDEN_STATUS = 403;
const HTTP_UNAVAILABLE_STATUS = 503;
const ZONE_TOKEN_FACTORIES = { meeting: createMeetingAudioToken, private: createPrivateVoiceToken };
export function conversationTokenEndpoint(kind: ConversationKind) {
  return async (request: HttpRequest, response: HttpResponse) => {
    const sessionToken = sessionFromCookie(request.header("cookie"));
    const session = await getSession(sessionToken);
    if (!session || !sessionToken) { response.status(HTTP_UNAUTHORIZED_STATUS).json({error: "Authentication required."}); return; }
    const payload: unknown = request.body;
    if (!isSpatialMediaTokenRequest(payload)) { response.status(HTTP_BAD_REQUEST_STATUS).json({error: "Invalid conversation request."}); return; }
    const identity = liveKitIdentity(session.username, sessionToken);
    try {
      const result = await mintConversationGrant(kind, payload, {
        role: async () => {
          const current = await getSession(sessionToken);
          return current?.username === session.username ? getOfficeRole(current.username, payload.officeId, current.role === "maintainer") : null;
        },
        current: () => OfficeRoom.getConversationMediaGrant(payload.officeId, session.username, identity),
        mint: (targetId, mode, descriptor) => {
          if (kind === "proximity") return createProximityAudioToken(session.username, identity, payload.officeId, targetId, mode);
          if (!descriptor) throw new ConversationAuthorizationError("Conversation access changed.");
          return ZONE_TOKEN_FACTORIES[kind](session.username, identity, descriptor, mode);
        },
      });
      response.json({ ...result.token, ...(kind === "proximity" ? { groupId: result.conversation.mediaTarget.id } : {}) });
    } catch (error) {
      const status = error instanceof ConversationAuthorizationError ? HTTP_FORBIDDEN_STATUS : HTTP_UNAVAILABLE_STATUS;
      response.status(status).json({error: errorMessage(error)});
    }
  };
}
