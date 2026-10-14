import type { VoiceTarget } from "./voiceTarget";

const VOICE_TOKEN_ERROR_LABEL = "Could not authorize voice.";
const VOICE_TOKEN_PATHS = { meeting: "/media/meeting-token", private: "/media/private-token", proximity: "/media/proximity-token", spotlight: "/media/spotlight-token" };
const HTTP_UNAUTHORIZED_STATUS = 401;
const HTTP_FORBIDDEN_STATUS = 403;
export function isVoiceDeniedStatus(status: number | undefined): boolean {
  return status === HTTP_UNAUTHORIZED_STATUS || status === HTTP_FORBIDDEN_STATUS;
}

export class VoiceTokenError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}
export function isVoiceAuthorizationDenied(error: Error): boolean {
  return error instanceof VoiceTokenError && isVoiceDeniedStatus(error.status);
}

interface VoiceTokenResponse { url?: string; token?: string; groupId?: string; error?: string }

export async function fetchVoiceToken(endpoint: string, target: VoiceTarget, signal: AbortSignal): Promise<{ url: string; token: string } | null> {
  const body = { officeId: target.officeId, ...(target.kind === "meeting" ? { roomKey: target.id } : target.kind === "private" ? { zoneId: target.id } : {}) };
  const response = await fetch(`${endpoint}${VOICE_TOKEN_PATHS[target.kind]}`, {
    method: "POST", credentials: "include", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = VOICE_TOKEN_ERROR_LABEL;
    throw new VoiceTokenError(error, response.status);
  }
  const result = await response.json() as VoiceTokenResponse;
  if (!result.url || !result.token) throw new VoiceTokenError(result.error ?? VOICE_TOKEN_ERROR_LABEL);
  if (target.kind === "proximity" && result.groupId !== target.id) return null;
  return { url: result.url, token: result.token };
}
