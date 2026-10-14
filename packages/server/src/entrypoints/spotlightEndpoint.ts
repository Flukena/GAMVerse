import {
  mintSpotlightGrant,
  SpotlightAuthorizationError,
} from "../media/spotlightGrant.js";
import { getSession } from "../auth/service.js";
import { OfficeRoom } from "../offices/OfficeRoom.js";
import { getOfficeRole } from "../offices/repository.js";
import { createSpotlightToken, liveKitIdentity } from "../media/service.js";
import {
  sessionFromCookie,
  type HttpRequest,
  type HttpResponse,
} from "../http/middleware.js";
const AUTHENTICATION_REQUIRED_LABEL = "Authentication required.";
const OFFICE_ACCESS_DENIED_LABEL = "Office access denied.";
const SPOTLIGHT_PUBLISH_DENIED_LABEL = "Spotlight publish access denied.";
const SPOTLIGHT_ACCESS_DENIED_LABEL = "Spotlight access denied.";
const HTTP_UNAUTHORIZED_STATUS = 401;
const HTTP_FORBIDDEN_STATUS = 403;
const HTTP_SERVICE_UNAVAILABLE_STATUS = 503;
const SPOTLIGHT_UNAVAILABLE_LABEL = "Spotlight service unavailable.";
export function spotlightFailureStatus(error: unknown) {
  return error instanceof SpotlightAuthorizationError
    ? HTTP_FORBIDDEN_STATUS
    : HTTP_SERVICE_UNAVAILABLE_STATUS;
}
export async function spotlightTokenEndpoint(
  request: HttpRequest,
  response: HttpResponse,
) {
  const sessionToken = sessionFromCookie(request.header("cookie"));
  const session = await getSession(sessionToken);
  if (!session || !sessionToken) {
    response.status(HTTP_UNAUTHORIZED_STATUS).json({ error: AUTHENTICATION_REQUIRED_LABEL });
    return;
  }
  const officeId = request.body?.officeId;
  const publish = request.body?.publish === true;
  if (
    typeof officeId !== "string" ||
    !(await getOfficeRole(session.username, officeId))
  ) {
    response.status(HTTP_FORBIDDEN_STATUS).json({ error: OFFICE_ACCESS_DENIED_LABEL });
    return;
  }
  const identity = liveKitIdentity(session.username, sessionToken);
  const spotlight = OfficeRoom.getSpotlight(
    officeId,
    session.username,
    identity,
  );
  const grant = spotlight?.grant(session.username, publish);
  if (!spotlight || !grant) {
    response.status(HTTP_FORBIDDEN_STATUS).json({ error: SPOTLIGHT_PUBLISH_DENIED_LABEL });
    return;
  }
  try {
    const token = await mintSpotlightGrant(
      spotlight,
      session.username,
      identity,
      publish,
      {
        role: () => getOfficeRole(session.username, officeId),
        mint: (roomName, canPublish) =>
          createSpotlightToken(
            session.username,
            identity,
            roomName,
            canPublish,
          ),
      },
    );
    response.json(token);
  } catch (error) {
    response
      .status(spotlightFailureStatus(error))
      .json({
        error:
          error instanceof SpotlightAuthorizationError
            ? SPOTLIGHT_ACCESS_DENIED_LABEL
            : SPOTLIGHT_UNAVAILABLE_LABEL,
      });
  }
}
