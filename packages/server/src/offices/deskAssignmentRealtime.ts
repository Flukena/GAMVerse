import { isDeskAssignmentFenceStatus, type DeskAssignmentFence } from "@gammyverse/shared";
import { requestRealtimeControl } from "../infra/realtimeControl.js";
import { DeskAssignmentError } from "./deskAssignments.js";

const DESK_FENCE_PREPARE_TIMEOUT_MS = 8_000;
const FENCE_CONTROL_PATH = "offices/desk-assignment";
const FENCE_UNAVAILABLE_LABEL = "Live desk access could not be secured. Reload and try again.";

export class DeskAssignmentRealtime {
  async prepare(fence: DeskAssignmentFence) {
    await requestRealtimeControl(FENCE_CONTROL_PATH, { ...fence, action: "prepare" }, DESK_FENCE_PREPARE_TIMEOUT_MS);
  }
  async rollback(fence: DeskAssignmentFence) {
    await requestRealtimeControl(FENCE_CONTROL_PATH, { ...fence, action: "rollback" });
  }
  async status(officeId: string): Promise<{operation: DeskAssignmentFence | null; appliedConfigVersion: number | null}> {
    const response = await requestRealtimeControl(FENCE_CONTROL_PATH, { officeId, action: "status" });
    if (!isDeskAssignmentFenceStatus(response)) throw new DeskAssignmentError("unavailable", FENCE_UNAVAILABLE_LABEL);
    return response;
  }
  async recover(fence: DeskAssignmentFence) {
    await requestRealtimeControl(FENCE_CONTROL_PATH, { ...fence, action: "recover" });
  }
  async refresh(officeId: string) {
    await requestRealtimeControl("offices/map", { officeId });
  }
}
