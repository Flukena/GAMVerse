import { isClientDiagnostic } from "@gammyverse/shared";
import type { PlatformRole } from "../auth/service.js";
import { DiagnosticRateLimit, insertDiagnostics, listDiagnostics } from "../infra/diagnostics.js";
import { getOfficeRole } from "../offices/repository.js";

type Session = { username: string; role: PlatformRole } | null;
const perUser = new DiagnosticRateLimit();
const global = new DiagnosticRateLimit();
const defaults = { insert: insertDiagnostics, list: listDiagnostics, officeRole: getOfficeRole, perUser, global };
type Dependencies = typeof defaults;

export async function receiveDiagnostic(session: Session, body: unknown, dependencies: Dependencies = defaults) {
  if (!session) return { status: 401, body: { error: "Authentication required." } };
  if (!isClientDiagnostic(body)) return { status: 400, body: { error: "Invalid diagnostic event." } };
  if (!dependencies.perUser.allow(session.username, 6) || !dependencies.global.allow("browser", 120)) {
    return { status: 429, body: { error: "Diagnostic rate limit reached." } };
  }
  if (body.officeId && !await dependencies.officeRole(session.username, body.officeId, session.role === "maintainer")) {
    return { status: 403, body: { error: "Office access required." } };
  }
  await dependencies.insert([{ ...body, source: "browser", occurredAt: new Date().toISOString() }]);
  return { status: 201, body: { ok: true } };
}

export async function readDiagnostics(session: Session, cursor: unknown, dependencies: Dependencies = defaults) {
  if (!session || session.role !== "maintainer") return { status: 403, body: { error: "Maintainer access required." } };
  if (cursor !== undefined && (typeof cursor !== "string" || !/^[1-9]\d{0,17}$/.test(cursor))) {
    return { status: 400, body: { error: "Invalid diagnostic cursor." } };
  }
  return { status: 200, body: await dependencies.list(cursor as string | undefined) };
}
