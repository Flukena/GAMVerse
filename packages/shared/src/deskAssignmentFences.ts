import { conversationRecord, conversationText } from "./conversationValidation.js";
import { isOfficeDesksChanged } from "./desks.js";

export const DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS = 10_000;
export const DESK_ASSIGNMENT_FENCE_MAX_ZONES_COUNT = 2;
const FENCE_ZONE_ID_MAX_CHARACTERS = 512;
const OPERATION_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type DeskAssignmentFence = {
  officeId: string;
  operationId: string;
  expectedConfigVersion: number;
  newConfigVersion: number;
  zoneIds: string[];
  deadlineAtMs: number;
};
export type DeskAssignmentFenceControl = DeskAssignmentFence & { action: "prepare" | "rollback" | "recover" };
export function isDeskAssignmentFence(value: unknown): value is DeskAssignmentFence {
  return conversationRecord(value) && typeof value.operationId === "string" && OPERATION_UUID_PATTERN.test(value.operationId)
    && isOfficeDesksChanged({ officeId: value.officeId, configVersion: value.expectedConfigVersion })
    && Number.isSafeInteger(value.newConfigVersion) && value.newConfigVersion === Number(value.expectedConfigVersion) + 1
    && Number.isSafeInteger(value.deadlineAtMs) && Number(value.deadlineAtMs) > 0
    && Array.isArray(value.zoneIds) && value.zoneIds.length > 0 && value.zoneIds.length <= DESK_ASSIGNMENT_FENCE_MAX_ZONES_COUNT
    && value.zoneIds.every(id => conversationText(id, FENCE_ZONE_ID_MAX_CHARACTERS)) && new Set(value.zoneIds).size === value.zoneIds.length;
}
export function isDeskAssignmentFenceControl(value: unknown): value is DeskAssignmentFenceControl {
  return conversationRecord(value) && ["prepare", "rollback", "recover"].includes(String(value.action)) && isDeskAssignmentFence(value);
}
export function isDeskAssignmentFenceStatus(value: unknown): value is { operation: DeskAssignmentFence | null; appliedConfigVersion: number | null } {
  return conversationRecord(value) && (value.operation === null || isDeskAssignmentFence(value.operation))
    && (value.appliedConfigVersion === null || (typeof value.appliedConfigVersion === "number" && Number.isSafeInteger(value.appliedConfigVersion) && value.appliedConfigVersion > 0));
}
export function isDeskAssignmentFenceStatusRequest(value: unknown): value is { action: "status"; officeId: string } {
  return conversationRecord(value) && value.action === "status"
    && typeof value.officeId === "string" && OPERATION_UUID_PATTERN.test(value.officeId);
}
