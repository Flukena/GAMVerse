import { useEffect, useState } from "react";
import type { OfficeDirectoryMember } from "./peopleDirectory";

const DIRECTORY_REFRESH_INTERVAL_MS = 30_000;
const DIRECTORY_LOAD_FAILED_LABEL = "Could not load office members. Try again when your connection returns.";
const FORMER_OWNER_LABEL = "Former owner";
class DirectoryLoadError extends Error {}

type DirectorySnapshot = { officeId: string | null; members: OfficeDirectoryMember[] | null; loading: boolean; error: string | null };

function readMembers(value: unknown): OfficeDirectoryMember[] {
  if (typeof value !== "object" || value === null || !("members" in value) || !Array.isArray(value.members)) throw new DirectoryLoadError(DIRECTORY_LOAD_FAILED_LABEL);
  return value.members.flatMap((member: unknown) => {
    if (typeof member !== "object" || member === null || !("username" in member) || typeof member.username !== "string") throw new DirectoryLoadError(DIRECTORY_LOAD_FAILED_LABEL);
    return member.username === FORMER_OWNER_LABEL ? [] : [{ username: member.username }];
  });
}

export function useOfficeDirectory(endpoint?: string, officeId?: string | null, refreshKey?: string) {
  const [snapshot, setSnapshot] = useState<DirectorySnapshot>({ officeId: null, members: null, loading: false, error: null });
  useEffect(() => {
    if (!endpoint || !officeId) return;
    let controller: AbortController | null = null;
    let disposed = false;
    const refresh = async () => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      setSnapshot((previous) => ({ officeId, members: previous.officeId === officeId ? previous.members : null, loading: true, error: null }));
      try {
        const response = await fetch(`${endpoint}/offices/${encodeURIComponent(officeId)}`, { credentials: "include", cache: "no-store", signal: requestController.signal });
        if (!response.ok) throw new DirectoryLoadError(DIRECTORY_LOAD_FAILED_LABEL);
        const members = readMembers(await response.json());
        if (!disposed && !requestController.signal.aborted) setSnapshot({ officeId, members, loading: false, error: null });
      } catch (cause) {
        if (disposed || requestController.signal.aborted) return;
        if (!(cause instanceof DirectoryLoadError || cause instanceof TypeError || cause instanceof SyntaxError)) throw cause;
        setSnapshot({ officeId, members: [], loading: false, error: DIRECTORY_LOAD_FAILED_LABEL });
      }
    };
    const onFocus = () => { void refresh(); };
    void refresh();
    const interval = window.setInterval(onFocus, DIRECTORY_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    return () => { disposed = true; controller?.abort(); window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [endpoint, officeId, refreshKey]);
  return snapshot.officeId === officeId ? snapshot : { officeId: officeId ?? null, members: null, loading: Boolean(endpoint && officeId), error: null };
}
