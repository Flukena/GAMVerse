import { hasValidInternalServiceToken } from "../infra/internalServiceAuth.js";
import type { HttpRequest, HttpResponse } from "../http/middleware.js";
import { realtimeRuntimeMetrics } from "../infra/realtimeRuntimeMetrics.js";

type OperationsSnapshot = { ready: boolean; activeRoomCount: number; activeParticipantCount: number; recentErrorCount: number };
export function realtimeMetricsEndpoint(serviceToken: string, operationsSnapshot: () => Promise<OperationsSnapshot>, runtimeSnapshot = () => realtimeRuntimeMetrics.snapshot()) {
  return async (request: HttpRequest, response: HttpResponse) => {
    if (!hasValidInternalServiceToken(request.header("x-internal-service-token"), serviceToken)) {
      response.sendStatus(401); return;
    }
    response.setHeader("Cache-Control", "no-store");
    response.json({ ...await operationsSnapshot(), runtime: runtimeSnapshot() });
  };
}
