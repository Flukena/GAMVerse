import { type OfficeDesk, type OfficeDeskAssignmentCommand } from "@gammyverse/shared";

export type DeskAssignmentErrorCode = "invalid" | "forbidden" | "conflict" | "unavailable";
export class DeskAssignmentError extends Error {
  constructor(readonly code: DeskAssignmentErrorCode, message: string) { super(message); }
}
export const DESK_ASSIGNMENT_MAP_CHANGED_LABEL = "The office map changed. Reload before assigning a desk.";
export const DESK_ASSIGNMENT_MEDIA_UNAVAILABLE_LABEL = "Private desk audio could not be secured.";
const MEMBER_ALREADY_ASSIGNED_LABEL = "This member already has a desk. Use Move to change their desk.";
export type DeskOwnerChange = { desk: OfficeDesk; ownerUsername: string | null };
export const DESK_ASSIGNMENT_CONFLICT_LABEL = "Desk assignments changed. Reload and try again.";

function currentDesk(desks: readonly OfficeDesk[], id: string): OfficeDesk {
  const desk = desks.find(entry => entry.id === id);
  if (!desk) throw new DeskAssignmentError("conflict", DESK_ASSIGNMENT_CONFLICT_LABEL);
  return desk;
}

/** Produces a validated, ordered write set; moving clears the unique source owner first. */
export function planDeskAssignment(desks: readonly OfficeDesk[], command: OfficeDeskAssignmentCommand): DeskOwnerChange[] {
  if (command.action === "move") {
    const source = currentDesk(desks, command.sourceDeskId);
    const target = currentDesk(desks, command.targetDeskId);
    if (source.id === target.id || source.ownerUsername !== command.expectedSourceOwnerUsername || target.ownerUsername !== null)
      throw new DeskAssignmentError("conflict", DESK_ASSIGNMENT_CONFLICT_LABEL);
    return [{ desk: source, ownerUsername: null }, { desk: target, ownerUsername: source.ownerUsername }];
  }
  const desk = currentDesk(desks, command.deskId);
  if (desk.ownerUsername !== command.expectedOwnerUsername) throw new DeskAssignmentError("conflict", DESK_ASSIGNMENT_CONFLICT_LABEL);
  if (command.action === "unassign") return [{ desk, ownerUsername: null }];
  if (desks.some(entry => entry.ownerUsername === command.ownerUsername))
    throw new DeskAssignmentError("conflict", MEMBER_ALREADY_ASSIGNED_LABEL);
  return [{ desk, ownerUsername: command.ownerUsername }];
}
