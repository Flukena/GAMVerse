export const CLIENT_DIAGNOSTIC_CODES = [
  "frame_stall", "slow_frames", "long_task", "browser_error", "unhandled_rejection",
  "connection_drop", "connection_error", "join_error", "media_error",
] as const;
export const SERVER_DIAGNOSTIC_CODES = ["cpu_peak", "event_loop_stall", "server_error"] as const;
export type ClientDiagnosticCode = typeof CLIENT_DIAGNOSTIC_CODES[number];
export type DiagnosticCode = ClientDiagnosticCode | typeof SERVER_DIAGNOSTIC_CODES[number];
export type DiagnosticMetrics = { durationMs?: number; count?: number; closeCode?: number; cpuPercent?: number };
export type ClientDiagnostic = { code: ClientDiagnosticCode; officeId: string | null; metrics: DiagnosticMetrics };
export type DiagnosticItem = {
  id: string; occurredAt: string; source: "browser" | "api" | "realtime";
  code: DiagnosticCode; officeId: string | null; metrics: DiagnosticMetrics;
};
export type DiagnosticPage = { items: DiagnosticItem[]; nextCursor: string | null };
export const DIAGNOSTIC_RETENTION_DAYS = 7;
export const DIAGNOSTIC_COOLDOWN_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isClientDiagnostic(value: unknown): value is ClientDiagnostic {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  if (Object.keys(report).some(key => !["code", "officeId", "metrics"].includes(key))) return false;
  if (!CLIENT_DIAGNOSTIC_CODES.some(code => code === report.code)) return false;
  if (report.officeId !== null && (typeof report.officeId !== "string" || !UUID.test(report.officeId))) return false;
  if (!report.metrics || typeof report.metrics !== "object" || Array.isArray(report.metrics)) return false;
  return Object.entries(report.metrics).every(([key, number]) =>
    ["durationMs", "count", "closeCode"].includes(key) && typeof number === "number"
    && Number.isFinite(number) && number >= 0 && number <= 3_600_000
    && (key === "durationMs" || Number.isInteger(number)));
}
