import { normalizeAccountUsername } from "@gammyverse/shared";
import type { PlatformRole, setAccountPlatformRole } from "../auth/service.js";
import { errorMessage } from "../http/middleware.js";

type RoleDependencies = {
  setRole: typeof setAccountPlatformRole;
  disconnectAccount(username: string): Promise<void>;
};

/** Complete role changes across the persisted session and realtime boundaries. */
export async function accountRoleEndpoint(
  session: { username: string; role: PlatformRole } | null,
  usernameValue: unknown,
  roleValue: unknown,
  dependencies: RoleDependencies,
) {
  if (!session || session.role !== "maintainer") {
    return { status: 403, body: { error: "Maintainer access required." } };
  }
  if (roleValue !== "user" && roleValue !== "maintainer") {
    return {
      status: 400,
      body: { error: "Platform role must be user or maintainer." },
    };
  }
  const username = normalizeAccountUsername(usernameValue);
  if (!username) return { status: 400, body: { error: "Account not found." } };
  try {
    const result = await dependencies.setRole(
      session.username,
      username,
      roleValue,
    );
    if ("error" in result) return { status: 400, body: result };
    // A previous request may have committed before its realtime notification failed.
    // Always retry this idempotent kick, even when persistence reports no change.
    try {
      await dependencies.disconnectAccount(username);
    } catch {
      return {
        status: 503,
        body: {
          ...result,
          activeSessionsDisconnected: false,
          error: "The requested role is persisted, but active connections could not be closed. Retry after realtime recovers.",
        },
      };
    }
    return { status: 200, body: { ...result, activeSessionsDisconnected: true } };
  } catch (error) {
    return { status: 503, body: { error: errorMessage(error) } };
  }
}
