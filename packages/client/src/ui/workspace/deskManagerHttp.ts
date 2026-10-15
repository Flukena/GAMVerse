import type { DeskFetch } from "./officeDesks";

const HTTP_FORBIDDEN_STATUS = 403;
const HTTP_CONFLICT_STATUS = 409;
const INVALID_RESPONSE_LABEL = "Desk management returned an invalid response. Reload and try again.";
const UNAVAILABLE_LABEL = "Desk management is unavailable. Reload and try again.";
export class DeskManagerError extends Error {
  constructor(message: string, readonly code: "invalid" | "forbidden" | "conflict" | "unavailable") { super(message); }
}
export async function deskManagerPayload(fetcher: DeskFetch, endpoint: string, officeId: string, init: RequestInit): Promise<unknown> {
  const response = await fetcher(`${endpoint}/offices/${encodeURIComponent(officeId)}/desks/assignments`, { credentials: "include", ...init });
  let payload: unknown;
  try { payload = await response.json(); }
  catch (cause) { if (cause instanceof SyntaxError) throw new DeskManagerError(INVALID_RESPONSE_LABEL, "invalid"); throw cause; }
  if (response.ok) return payload;
  const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : UNAVAILABLE_LABEL;
  const code = response.status === HTTP_FORBIDDEN_STATUS ? "forbidden" : response.status === HTTP_CONFLICT_STATUS ? "conflict" : "unavailable";
  throw new DeskManagerError(message, code);
}
