import { DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS, type DeskAssignmentFence } from "@gammyverse/shared";
import { DeskAssignmentError } from "./deskAssignments.js";

const MAX_PENDING_ASSIGNMENT_OFFICES_COUNT = 256;
const MAX_CANCELLED_ASSIGNMENT_OPERATIONS_COUNT = 1000;
const FENCE_CONFLICT_LABEL = "Another desk change is awaiting live office refresh. Reload before trying again.";

/** Process-local safety barrier. Pending fences never expire or imply transaction outcome. */
export class DeskAssignmentFences {
  private readonly offices = new Map<string, DeskAssignmentFence>();
  private readonly cancelled = new Map<string, number>();
  private cancelOverflowUntilMs = 0;
  constructor(private readonly nowMs: () => number = Date.now) {}

  prepare(fence: DeskAssignmentFence): DeskAssignmentFence {
    this.pruneCancelled();
    const existing = this.offices.get(fence.officeId);
    if (existing?.operationId === fence.operationId) {
      if (JSON.stringify(existing) !== JSON.stringify(fence)) throw new DeskAssignmentError("conflict", FENCE_CONFLICT_LABEL);
      return structuredClone(existing);
    }
    const nowMs = this.nowMs();
    if (existing || nowMs <= this.cancelOverflowUntilMs || this.cancelled.has(fence.operationId) || fence.deadlineAtMs < nowMs || fence.deadlineAtMs > nowMs + DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS
      || this.offices.size >= MAX_PENDING_ASSIGNMENT_OFFICES_COUNT || this.cancelled.size >= MAX_CANCELLED_ASSIGNMENT_OPERATIONS_COUNT)
      throw new DeskAssignmentError("conflict", FENCE_CONFLICT_LABEL);
    this.offices.set(fence.officeId, structuredClone(fence));
    return structuredClone(fence);
  }

  current(officeId: string): DeskAssignmentFence | undefined {
    const fence = this.offices.get(officeId);
    return fence ? structuredClone(fence) : undefined;
  }

  rollback(fence: DeskAssignmentFence): boolean {
    this.pruneCancelled();
    // Cancel also before prepare arrives; a timed-out request cannot install a late fence.
    if (fence.deadlineAtMs >= this.nowMs()) {
      if (this.cancelled.size < MAX_CANCELLED_ASSIGNMENT_OPERATIONS_COUNT || this.cancelled.has(fence.operationId)) this.cancelled.set(fence.operationId, fence.deadlineAtMs);
      else this.cancelOverflowUntilMs = Math.max(this.cancelOverflowUntilMs, fence.deadlineAtMs);
    }
    const existing = this.offices.get(fence.officeId);
    if (existing?.operationId !== fence.operationId || existing.expectedConfigVersion !== fence.expectedConfigVersion) return false;
    this.offices.delete(fence.officeId);
    return true;
  }

  applied(officeId: string, configVersion: number): DeskAssignmentFence | undefined {
    const fence = this.offices.get(officeId);
    if (!fence || configVersion < fence.newConfigVersion) return undefined;
    this.offices.delete(officeId);
    return structuredClone(fence);
  }

  private pruneCancelled() {
    for (const [id, deadlineAtMs] of this.cancelled) if (deadlineAtMs < this.nowMs()) this.cancelled.delete(id);
  }
}

export const deskAssignmentFences = new DeskAssignmentFences();
