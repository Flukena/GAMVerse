import { logServerError, logServerEvent } from "./logger.js";

const REALTIME_CONTROL_TIMEOUT_MS = 3_000;
const REALTIME_CONTROL_UNCONFIGURED_LABEL = "Realtime service control is not configured.";
const REALTIME_CONTROL_FAILED_LABEL = "Realtime office refresh is unavailable.";

export async function requestRealtimeControl(action: string, body: Record<string, unknown>, timeoutMs = REALTIME_CONTROL_TIMEOUT_MS): Promise<unknown> {
  const baseUrl = process.env.REALTIME_INTERNAL_URL;
  const serviceToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (!baseUrl || !serviceToken) throw new Error(REALTIME_CONTROL_UNCONFIGURED_LABEL);
  const startedAt = performance.now();
  try {
    const response = await fetch(baseUrl.replace(/\/$/, "") + "/internal/" + action, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Internal-Service-Token": serviceToken },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(REALTIME_CONTROL_FAILED_LABEL);
    const result: unknown = response.status === 204 ? null : await response.json();
    logServerEvent("api", "realtime.control.completed", { action, officeId: typeof body.officeId === "string" ? body.officeId : undefined, durationMs: Math.round(performance.now() - startedAt) });
    return result;
  } catch (error) {
    logServerError("api", "realtime.control.failed", new Error(REALTIME_CONTROL_FAILED_LABEL), { action, officeId: typeof body.officeId === "string" ? body.officeId : undefined, durationMs: Math.round(performance.now() - startedAt) });
    throw error;
  }
}
