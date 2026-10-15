import { normalizeAccountUsername } from "@gammyverse/shared";
import type { PlatformRole, setAccountSuspended } from "../auth/service.js";
import { errorMessage } from "../http/middleware.js";

type SuspensionDependencies = {
  setSuspended: typeof setAccountSuspended;
  disconnectAccount(username: string): Promise<void>;
};

export async function accountSuspensionEndpoint(
  session: { username: string; role: PlatformRole } | null,
  usernameValue: unknown,
  suspended: unknown,
  dependencies: SuspensionDependencies,
) {
  if (!session || session.role !== "maintainer") {
    return { status: 403, body: { error: "Maintainer access required." } };
  }
  if (typeof suspended !== "boolean") {
    return { status: 400, body: { error: "Suspension status must be true or false." } };
  }
  const username = normalizeAccountUsername(usernameValue);
  if (!username) return { status: 400, body: { error: "Account not found." } };
  try {
    const result = await dependencies.setSuspended(session.username, username, suspended);
    if ("error" in result) return { status: 400, body: result };
    if (suspended) {
      // Repeat the kick when retrying an already-persisted suspension.
      try {
        await dependencies.disconnectAccount(username);
      } catch {
        return {
          status: 503,
          body: {
            ...result,
            activeSessionsDisconnected: false,
            error: "Account is suspended, but active connections could not be closed. Retry after realtime recovers.",
          },
        };
      }
    }
    return {
      status: 200,
      body: suspended ? { ...result, activeSessionsDisconnected: true } : result,
    };
  } catch (error) {
    return { status: 503, body: { error: errorMessage(error) } };
  }
}
