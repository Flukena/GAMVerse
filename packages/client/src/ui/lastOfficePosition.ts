const LAST_POSITION_PREFIX = "gammyverse.lastOfficePosition.v1.";

export type LastOfficePosition = { x: number; z: number };

function keyFor(username: string, officeId: string) {
  return `${LAST_POSITION_PREFIX}${encodeURIComponent(username.trim().toLowerCase())}.${encodeURIComponent(officeId)}`;
}

export function readLastOfficePosition(username: string, officeId: string): LastOfficePosition | null {
  try {
    const stored = window.localStorage.getItem(keyFor(username, officeId));
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<LastOfficePosition>;
    if (!Number.isFinite(value.x) || !Number.isFinite(value.z) || Math.abs(value.x!) > 500 || Math.abs(value.z!) > 500) return null;
    return { x: value.x!, z: value.z! };
  } catch {
    return null;
  }
}

export function saveLastOfficePosition(username: string, officeId: string, position: LastOfficePosition): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
  try {
    window.localStorage.setItem(keyFor(username, officeId), JSON.stringify(position));
  } catch {
    // Storage may be unavailable in private browsing or under quota limits.
  }
}

export function clearLastOfficePositions(): void {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(LAST_POSITION_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Clearing local state must not prevent logout or a new sign-in.
  }
}
