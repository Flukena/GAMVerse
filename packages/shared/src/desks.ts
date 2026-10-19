import type { RoomLayout } from "./roomLayout.js";
import { normalizeAccountUsername } from "./accountUsername.js";
import { conversationRecord, conversationText } from "./conversationValidation.js";

export type OfficeDesk = { id: string; officeId: string; zoneId: string; ownerUsername: string | null };
export type OfficeDeskSnapshot = { desks: OfficeDesk[]; configVersion: number };
export type ReturnToDeskIntent = { deskId: string };
const DESK_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidReturnToDeskIntent(value: unknown): value is ReturnToDeskIntent {
  return typeof value === "object" && value !== null && "deskId" in value && typeof value.deskId === "string" && DESK_UUID_PATTERN.test(value.deskId) && Object.keys(value).length === 1;
}
export function projectDeskOwners(layout: RoomLayout, desks: readonly OfficeDesk[]): RoomLayout {
  const byZone = new Map(desks.map(desk => [desk.zoneId, desk]));
  return { ...layout, zones: layout.zones.map(({ ownerUsername: _owner, ...zone }) => {
    if (zone.kind !== "private") return zone;
    const owner = byZone.get(zone.id)?.ownerUsername;
    return owner ? { ...zone, ownerUsername: owner } : zone;
  }) };
}

export type OfficeDeskChangeResult = OfficeDeskSnapshot & { config: unknown };
const MIN_CONFIG_VERSION_COUNT = 1;
const MAX_DESKS_COUNT = 250;
function isOfficeDesk(value: unknown): value is OfficeDesk {
  if (typeof value !== "object" || value === null) return false;
  const desk = value as Partial<OfficeDesk>;
  return typeof desk.id === "string" && DESK_UUID_PATTERN.test(desk.id)
    && typeof desk.officeId === "string" && DESK_UUID_PATTERN.test(desk.officeId)
    && typeof desk.zoneId === "string" && desk.zoneId.length > 0
    && (desk.ownerUsername === null || typeof desk.ownerUsername === "string");
}
export function isOfficeDeskSnapshot(value: unknown): value is OfficeDeskSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Partial<OfficeDeskSnapshot>;
  return Number.isSafeInteger(snapshot.configVersion) && Number(snapshot.configVersion) >= MIN_CONFIG_VERSION_COUNT
    && Array.isArray(snapshot.desks) && snapshot.desks.length <= MAX_DESKS_COUNT && snapshot.desks.every(isOfficeDesk)
    && new Set(snapshot.desks.map(desk => desk.id)).size === snapshot.desks.length
    && new Set(snapshot.desks.map(desk => desk.zoneId)).size === snapshot.desks.length;
}
export function isOfficeDeskChangeResult(value: unknown): value is OfficeDeskChangeResult {
  return isOfficeDeskSnapshot(value) && "config" in value && typeof value.config === "object" && value.config !== null;
}

export const OFFICE_DESKS_CHANGED_EVENT = "office-desks-changed";
export const OFFICE_DESK_ASSIGNMENT_MEMBERS_MAX_COUNT = 1000;
const DESK_LABEL_MAX_CHARACTERS = 32;
type DeskAssignmentBase = { requestId: string; expectedConfigVersion: number };
export type OfficeDeskAssignmentCommand = DeskAssignmentBase & (
  | { action: "assign"; deskId: string; expectedOwnerUsername: null; ownerUsername: string }
  | { action: "unassign"; deskId: string; expectedOwnerUsername: string }
  | { action: "move"; sourceDeskId: string; targetDeskId: string; expectedSourceOwnerUsername: string; expectedTargetOwnerUsername: null }
);
export type OfficeDeskAdministrationSnapshot = Omit<OfficeDeskSnapshot, "desks"> & {
  desks: (OfficeDesk & { name: string })[];
  realtimeSync: "applied" | "pending";
  officeId: string;
  members: { username: string; displayName: string }[];
};
export type OfficeDeskAssignmentResult = OfficeDeskChangeResult & {
  requestId: string;
  persisted: true;
  realtimeSync: "applied" | "pending";
};
export type OfficeDesksChanged = { officeId: string; configVersion: number };

function deskUuid(value: unknown): value is string {
  return typeof value === "string" && DESK_UUID_PATTERN.test(value);
}
function canonicalUsername(value: unknown): value is string {
  return typeof value === "string" && normalizeAccountUsername(value) === value;
}
function configVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= MIN_CONFIG_VERSION_COUNT;
}
function assignmentKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const allowed = ["requestId", "expectedConfigVersion", "action", ...fields];
  return Object.keys(value).every(key => allowed.includes(key));
}
export function isOfficeDeskAssignmentCommand(value: unknown): value is OfficeDeskAssignmentCommand {
  if (!conversationRecord(value) || !deskUuid(value.requestId) || !configVersion(value.expectedConfigVersion)) return false;
  switch (value.action) {
    case "assign":
      return deskUuid(value.deskId) && value.expectedOwnerUsername === null && canonicalUsername(value.ownerUsername)
        && assignmentKeys(value, ["deskId", "expectedOwnerUsername", "ownerUsername"]);
    case "unassign":
      return deskUuid(value.deskId) && canonicalUsername(value.expectedOwnerUsername)
        && assignmentKeys(value, ["deskId", "expectedOwnerUsername"]);
    case "move":
      return deskUuid(value.sourceDeskId) && deskUuid(value.targetDeskId) && value.sourceDeskId !== value.targetDeskId
        && canonicalUsername(value.expectedSourceOwnerUsername) && value.expectedTargetOwnerUsername === null
        && assignmentKeys(value, ["sourceDeskId", "targetDeskId", "expectedSourceOwnerUsername", "expectedTargetOwnerUsername"]);
    default:
      return false;
  }
}
export function isOfficeDeskAdministrationSnapshot(value: unknown): value is OfficeDeskAdministrationSnapshot {
  if (!conversationRecord(value) || !deskUuid(value.officeId) || (value.realtimeSync !== "applied" && value.realtimeSync !== "pending") || !Array.isArray(value.members)
    || value.members.length > OFFICE_DESK_ASSIGNMENT_MEMBERS_MAX_COUNT) return false;
  if (!Array.isArray(value.desks) || !value.desks.every(desk => conversationRecord(desk) && conversationText(desk.name, DESK_LABEL_MAX_CHARACTERS))) return false;
  const members = value.members;
  if (!members.every(member => conversationRecord(member) && canonicalUsername(member.username)
    && conversationText(member.displayName, DESK_LABEL_MAX_CHARACTERS))) return false;
  const officeId = value.officeId;
  return new Set(members.map(member => member.username)).size === members.length && isOfficeDeskSnapshot(value)
    && value.desks.every(desk => desk.officeId === officeId);
}
export function isOfficeDeskAssignmentResult(value: unknown): value is OfficeDeskAssignmentResult {
  return conversationRecord(value) && deskUuid(value.requestId) && value.persisted === true
    && (value.realtimeSync === "applied" || value.realtimeSync === "pending") && isOfficeDeskChangeResult(value);
}
export function isOfficeDesksChanged(value: unknown): value is OfficeDesksChanged {
  return conversationRecord(value) && deskUuid(value.officeId) && configVersion(value.configVersion);
}
