import { effectiveAvailability, type AvailabilityProfile, type UserStatusCommand } from "@gammyverse/shared";

export type AvailabilityAcknowledgement = AvailabilityProfile & { sessionId: string; requestId?: string };
export function matchesAvailabilityResponseRequestId(command: UserStatusCommand, response: { requestId?: string }): boolean {
  return command.requestId === response.requestId;
}
export function matchesAvailabilityAcknowledgement(command: UserStatusCommand, message: AvailabilityAcknowledgement, sessionId: string, nowMs = Date.now()): boolean {
  if (!matchesAvailabilityResponseRequestId(command, message) || message.sessionId !== sessionId || message.status !== command.status) return false;
  if (command.customStatus === undefined) return true;
  const expected = effectiveAvailability({ status: command.status, customStatus: command.customStatus }, nowMs).customStatus;
  if (expected === null || message.customStatus === null) return expected === message.customStatus;
  return expected.text === message.customStatus.text && expected.emoji === message.customStatus.emoji
    && expected.expiresAtMs === message.customStatus.expiresAtMs;
}
