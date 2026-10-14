const ACCOUNT_USERNAME_PATTERN = /^[a-z0-9_.-]{3,24}$/;

export function normalizeAccountUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return ACCOUNT_USERNAME_PATTERN.test(username) ? username : null;
}
