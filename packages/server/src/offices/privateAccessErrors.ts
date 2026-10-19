import { logServerError } from "../infra/logger.js";
export class PrivateAccessDeniedError extends Error {}
const PRIVATE_ACCESS_FAILURE_EVENT_LABEL = "private.access.failed";
const PRIVATE_ACCESS_UNAVAILABLE_LABEL = "Room access service is unavailable. Try again.";
export function privateAccessFailure(error: unknown, officeId: string): string {
  if (error instanceof PrivateAccessDeniedError) return error.message;
  logServerError("realtime", PRIVATE_ACCESS_FAILURE_EVENT_LABEL, new Error("Private room authorization or storage failed."), {officeId});
  return PRIVATE_ACCESS_UNAVAILABLE_LABEL;
}
