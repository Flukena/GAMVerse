import { isOfficeDeskAssignmentCommand, type OfficeDesk, type OfficeDeskAdministrationSnapshot, type OfficeDeskAssignmentCommand, type OfficeDeskAssignmentResult } from "@gammyverse/shared";

export type DeskManagerIntent = { action: "assign"; deskId: string; ownerUsername: string }
  | { action: "unassign"; deskId: string } | { action: "move"; sourceDeskId: string; targetDeskId: string };
export type DeskManagerState = {
  snapshot: OfficeDeskAdministrationSnapshot | null;
  loading: boolean;
  pendingDeskId: string | null;
  error: string | null;
  needsReload: boolean;
  saved: Pick<OfficeDeskAssignmentResult, "requestId" | "realtimeSync" | "configVersion"> | null;
};
export const EMPTY_DESK_MANAGER_STATE: DeskManagerState = { snapshot: null, loading: false, pendingDeskId: null, error: null, needsReload: false, saved: null };
export function vacantDeskIntent(snapshot: OfficeDeskAdministrationSnapshot, deskId: string, username: string): DeskManagerIntent | null {
  const target = snapshot.desks.find(desk => desk.id === deskId);
  if (!target || target.ownerUsername !== null || !snapshot.members.some(member => member.username === username)) return null;
  const source = snapshot.desks.find(desk => desk.ownerUsername === username);
  return source ? { action: "move", sourceDeskId: source.id, targetDeskId: target.id } : { action: "assign", deskId: target.id, ownerUsername: username };
}
function assignmentFields(snapshot: OfficeDeskAdministrationSnapshot, intent: DeskManagerIntent) {
  if (intent.action === "assign") {
    const proposed = vacantDeskIntent(snapshot, intent.deskId, intent.ownerUsername);
    return proposed?.action === "assign" ? { ...proposed, expectedOwnerUsername: null } : null;
  }
  if (intent.action === "unassign") {
    const desk = snapshot.desks.find(candidate => candidate.id === intent.deskId);
    return desk?.ownerUsername ? { ...intent, expectedOwnerUsername: desk.ownerUsername } : null;
  }
  const source = snapshot.desks.find(desk => desk.id === intent.sourceDeskId);
  const target = snapshot.desks.find(desk => desk.id === intent.targetDeskId);
  if (!source?.ownerUsername || !target || target.ownerUsername !== null || source.id === target.id) return null;
  return { ...intent, expectedSourceOwnerUsername: source.ownerUsername, expectedTargetOwnerUsername: null };
}
export function deskAssignmentCommand(snapshot: OfficeDeskAdministrationSnapshot, intent: DeskManagerIntent, requestId: string): OfficeDeskAssignmentCommand | null {
  const fields = assignmentFields(snapshot, intent);
  if (!fields) return null;
  const command = { ...fields, requestId, expectedConfigVersion: snapshot.configVersion };
  return isOfficeDeskAssignmentCommand(command) ? command : null;
}
export function deskOwnerDisplayName(snapshot: OfficeDeskAdministrationSnapshot, desk: OfficeDesk): string | null {
  if (desk.ownerUsername === null) return null;
  return snapshot.members.find(member => member.username === desk.ownerUsername)?.displayName ?? desk.ownerUsername;
}

export function deskManagerRows(snapshot: OfficeDeskAdministrationSnapshot, query: string): OfficeDeskAdministrationSnapshot["desks"] {
  const search = query.trim().toLocaleLowerCase();
  return snapshot.desks.filter(desk => `${desk.name} ${deskOwnerDisplayName(snapshot, desk) ?? ""} ${desk.ownerUsername ?? ""}`.toLocaleLowerCase().includes(search));
}
export function deskManagerMembers(snapshot: OfficeDeskAdministrationSnapshot, query: string): OfficeDeskAdministrationSnapshot["members"] {
  const search = query.trim().toLocaleLowerCase();
  return snapshot.members.filter(member => `${member.username} ${member.displayName}`.toLocaleLowerCase().includes(search));
}
