export const JUMP_DURATION_MS = 650;
export const JUMP_HEIGHT_M = 0.8;

export function isValidJumpInput(value: unknown): value is true {
  return value === true;
}

export function isValidJumpEvent(value: unknown): value is { sessionId: string } {
  return typeof value === "object" && value !== null && "sessionId" in value && typeof value.sessionId === "string" && value.sessionId.length > 0;
}

export function jumpHeightAt(elapsedMs: number): number {
  if (elapsedMs < 0 || elapsedMs >= JUMP_DURATION_MS) return 0;
  return Math.sin(Math.PI * elapsedMs / JUMP_DURATION_MS) * JUMP_HEIGHT_M;
}
