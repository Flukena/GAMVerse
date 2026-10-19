import { DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS, type DeskAssignmentFence, type OfficeDeskAssignmentCommand, type OfficeDeskAssignmentResult } from "@gammyverse/shared";
import type { Pool } from "pg";
import { logServerError } from "../infra/logger.js";
import { DeskAssignmentTransaction, deskAssignmentStorage, type DeskAssignmentActor } from "./deskAssignmentRepository.js";
import { DeskAssignmentRealtime } from "./deskAssignmentRealtime.js";
import { DeskAssignmentError } from "./deskAssignments.js";

const LIVE_REFRESH_PENDING_EVENT = "desk.assignment.refresh.pending";
const ROLLBACK_REFRESH_PENDING_EVENT = "desk.assignment.rollback.refresh.pending";
const COMMIT_OUTCOME_UNKNOWN_LABEL = "The desk change outcome is being checked. Reload before making another change.";
const SAFE_REFRESH_FAILED_LABEL = "Live desk access refresh failed.";
type AssignmentRealtime = Pick<DeskAssignmentRealtime, "prepare" | "rollback" | "status" | "recover" | "refresh">;

export class DeskAssignmentService {
  constructor(private readonly realtime: AssignmentRealtime = new DeskAssignmentRealtime(),
    private readonly store: Pool | undefined = undefined, private readonly nowMs: () => number = Date.now) {}

  private async recoverLocked(officeId: string, configVersion: number) {
    const status = await this.realtime.status(officeId);
    if (status.operation && status.operation.expectedConfigVersion === configVersion) await this.realtime.recover(status.operation);
    return status;
  }

  async list(officeId: string, actor: DeskAssignmentActor) {
    const transaction = await DeskAssignmentTransaction.open(this.store ?? deskAssignmentStorage(), officeId, actor, false);
    try {
      const snapshot = await transaction.snapshot();
      const status = await this.recoverLocked(officeId, snapshot.configVersion);
      await transaction.commit();
      const applied = status.operation ? await this.refreshPersisted(officeId)
        : status.appliedConfigVersion === null || status.appliedConfigVersion >= snapshot.configVersion;
      return { ...snapshot, realtimeSync: applied ? "applied" as const : "pending" as const };
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally { transaction.release(); }
  }

  async change(officeId: string, actor: DeskAssignmentActor, command: OfficeDeskAssignmentCommand): Promise<OfficeDeskAssignmentResult> {
    const transaction = await DeskAssignmentTransaction.open(this.store ?? deskAssignmentStorage(), officeId, actor, true);
    let fence: DeskAssignmentFence | undefined;
    try {
      const changes = await transaction.plan(command);
      await this.recoverLocked(officeId, transaction.map.config_version);
      fence = { officeId, operationId: command.requestId, expectedConfigVersion: command.expectedConfigVersion,
        newConfigVersion: command.expectedConfigVersion + 1, zoneIds: changes.map(change => change.desk.zoneId),
        deadlineAtMs: this.nowMs() + DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS };
      await this.realtime.prepare(fence);
      const result = await transaction.apply(changes);
      await transaction.commit();
      const applied = await this.refreshPersisted(officeId);
      return { ...result, requestId: command.requestId, persisted: true, realtimeSync: applied ? "applied" : "pending" };
    } catch (error) {
      const rolledBack = await transaction.rollback();
      if (rolledBack && fence) await this.rollbackFence(fence);
      if (!rolledBack) throw new DeskAssignmentError("unavailable", COMMIT_OUTCOME_UNKNOWN_LABEL);
      throw error;
    } finally { transaction.release(); }
  }

  private async refreshPersisted(officeId: string): Promise<boolean> {
    try { await this.realtime.refresh(officeId); return true; }
    catch {
      logServerError("api", LIVE_REFRESH_PENDING_EVENT, new Error(SAFE_REFRESH_FAILED_LABEL));
      return false;
    }
  }

  private async rollbackFence(fence: DeskAssignmentFence) {
    try { await this.realtime.rollback(fence); }
    catch { logServerError("api", ROLLBACK_REFRESH_PENDING_EVENT, new Error(SAFE_REFRESH_FAILED_LABEL)); }
  }
}
