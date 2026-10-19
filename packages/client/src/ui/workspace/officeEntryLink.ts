import { isOfficeShareAcceptance } from "@gammyverse/shared";
import type { OfficeShareRequest } from "./officeShareLinks";

const INVALID_LINK_LABEL = "This office link is invalid. Ask an office admin for a new link.";
const ACCEPT_ERROR_LABEL = "This office link could not be accepted. It may have expired or been revoked.";
const MISSING_OFFICE_LABEL = "The link was accepted, but its office could not be identified.";
export function getInviteRouteToken(path: string): string | null {
  return path.match(/^\/join\/([A-Za-z0-9_-]{30,100})\/?$/)?.[1] ?? null;
}
export function getOfficeShareRouteToken(path: string): string | null {
  const token = path.match(/^\/share\/([^/]+)\/?$/)?.[1];
  const candidate = { token };
  return isOfficeShareAcceptance(candidate) ? candidate.token : null;
}
/** Called only after account authentication; URL/history changes belong to the coordinator. */
export async function acceptOfficeEntryLink(endpoint: string, path: string, request: OfficeShareRequest = fetch): Promise<string | null> {
  const shareToken = getOfficeShareRouteToken(path);
  const token = shareToken ?? getInviteRouteToken(path);
  if (!token) {
    if (path === "/share" || path === "/join" || path.startsWith("/share/") || path.startsWith("/join/")) throw new Error(INVALID_LINK_LABEL);
    return null;
  }
  const acceptPath = shareToken ? "/office-invites/share-links/accept" : "/office-invites/accept";
  const response = await request(`${endpoint}${acceptPath}`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
  });
  const result = await response.json() as { officeId?: string; error?: string };
  if (!response.ok) throw new Error(result.error ?? ACCEPT_ERROR_LABEL);
  if (typeof result.officeId !== "string" || result.officeId.length === 0) throw new Error(MISSING_OFFICE_LABEL);
  return result.officeId;
}
