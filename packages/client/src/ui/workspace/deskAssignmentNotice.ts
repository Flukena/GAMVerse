import { OFFICE_DESKS_CHANGED_EVENT, isOfficeDesksChanged, isOfficeDeskSnapshot, type OfficeDesk } from "@gammyverse/shared";
import type { ConversationTransport } from "../media/conversationState";

const ASSIGNMENT_CHANGED_LABEL = "Your desk assignment changed. The latest assignment is loaded.";
export type DeskAssignmentNoticeContext = { officeId: string; username: string; sessionKey: string };
export class DeskAssignmentNoticeState {
  notice: string | null = null;
  private initialized = false;
  private observedVersion = 0;
  private lastEventVersion = 0;
  private pendingVersion: number | null = null;
  private pendingHasBaseline = false;
  private notifiedVersion = 0;
  constructor(readonly context: DeskAssignmentNoticeContext) {}
  observe(desks: readonly OfficeDesk[], configVersion: number): void {
    if (!isOfficeDeskSnapshot({ desks, configVersion }) || desks.some(desk => desk.officeId !== this.context.officeId) || configVersion <= this.observedVersion) return;
    this.initialized = true;
    this.observedVersion = configVersion;
    this.confirmNotice();
  }
  receiveEvent(payload: unknown): boolean {
    if (!isOfficeDesksChanged(payload) || payload.officeId !== this.context.officeId || payload.configVersion <= this.lastEventVersion) return false;
    this.lastEventVersion = payload.configVersion;
    this.pendingVersion = payload.configVersion;
    this.pendingHasBaseline = this.initialized;
    this.confirmNotice();
    return true;
  }
  dismiss(): void { this.notice = null; }
  private confirmNotice(): void {
    if (this.pendingVersion === null || this.observedVersion < this.pendingVersion) return;
    if (this.pendingHasBaseline && this.pendingVersion > this.notifiedVersion) {
      this.notice = ASSIGNMENT_CHANGED_LABEL;
      this.notifiedVersion = this.pendingVersion;
    }
    this.pendingVersion = null;
  }
}
export interface DeskAssignmentNoticeListener { changed(): void; refresh(): void }
export function observeDeskAssignmentChanges(state: DeskAssignmentNoticeState, room: ConversationTransport, listener: DeskAssignmentNoticeListener): () => void {
  let active = true;
  const dispose = room.onMessage(OFFICE_DESKS_CHANGED_EVENT, payload => {
    if (!active || !state.receiveEvent(payload)) return;
    listener.changed();
    listener.refresh();
  });
  return () => { active = false; dispose(); };
}
