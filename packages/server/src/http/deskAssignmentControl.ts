import { DeskAssignmentError } from "../offices/deskAssignments.js";
import { isDeskAssignmentFenceControl, isDeskAssignmentFenceStatusRequest } from "@gammyverse/shared";
import { hasValidInternalServiceToken } from "../infra/internalServiceAuth.js";
import { logServerError } from "../infra/logger.js";
import { OfficeRoom } from "../offices/OfficeRoom.js";
import { deskAssignmentFences } from "../offices/deskAssignmentFences.js";
import type { HttpRequest, HttpResponse } from "./middleware.js";

const HTTP_UNAUTHORIZED_STATUS = 401;
const HTTP_BAD_REQUEST_STATUS = 400;
const HTTP_CONFLICT_STATUS = 409;
const HTTP_UNAVAILABLE_STATUS = 503;
const HTTP_NO_CONTENT_STATUS = 204;
const INVALID_FENCE_LABEL = "Invalid desk access operation.";
const FENCE_FAILED_LABEL = "Desk access could not be secured.";
export function deskAssignmentControl(serviceToken: string) {
  return async (request: HttpRequest, response: HttpResponse) => {
    if (!hasValidInternalServiceToken(request.header("X-Internal-Service-Token"), serviceToken)) { response.sendStatus(HTTP_UNAUTHORIZED_STATUS); return; }
    const payload: unknown = request.body;
    if (isDeskAssignmentFenceStatusRequest(payload)) {
      response.json({ operation: deskAssignmentFences.current(payload.officeId) ?? null, appliedConfigVersion: OfficeRoom.deskAssignmentAppliedVersion(payload.officeId) });
      return;
    }
    if (!isDeskAssignmentFenceControl(payload)) { response.status(HTTP_BAD_REQUEST_STATUS).json({ error: INVALID_FENCE_LABEL }); return; }
    try {
      if (payload.action === "prepare") await OfficeRoom.prepareDeskAssignment(payload);
      else OfficeRoom.rollbackDeskAssignment(payload);
      response.sendStatus(HTTP_NO_CONTENT_STATUS);
    } catch (error) {
      if (error instanceof DeskAssignmentError) {
        response.status(error.code === "conflict" ? HTTP_CONFLICT_STATUS : HTTP_UNAVAILABLE_STATUS).json({ error: error.message });
        return;
      }
      logServerError("realtime", "desk.assignment.fence.failed", new Error(FENCE_FAILED_LABEL));
      response.status(HTTP_UNAVAILABLE_STATUS).json({ error: FENCE_FAILED_LABEL });
    }
  };
}
