const SHARE_TOKEN_CHARACTERS_COUNT = 43;
export const OFFICE_SHARE_LINK_TTL_DAYS = 7;
export function isOfficeShareAcceptance(value: unknown): value is { token: string } {
  if (!value || typeof value !== "object") return false;
  const token = (value as Record<string, unknown>).token;
  return typeof token === "string" && token.length === SHARE_TOKEN_CHARACTERS_COUNT && /^[A-Za-z0-9_-]+$/.test(token);
}
