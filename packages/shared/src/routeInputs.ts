const MAX_TARGET_SESSION_ID_LENGTH_CHARS = 128;

export function isValidAutoMoveInput(value: unknown): value is { x: number; z: number; randomVehicle?: boolean } {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return typeof input.x === "number" && Number.isFinite(input.x)
    && typeof input.z === "number" && Number.isFinite(input.z)
    && (input.randomVehicle === undefined || typeof input.randomVehicle === "boolean");
}

export function isValidTargetPlayerInput(value: unknown): value is { targetSessionId: string } {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  return typeof input.targetSessionId === "string"
    && input.targetSessionId.length > 0
    && input.targetSessionId.length <= MAX_TARGET_SESSION_ID_LENGTH_CHARS;
}
