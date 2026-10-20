import { useEffect, useRef } from "react";
import { installClientDiagnostics, reportClientDiagnostic } from "./clientDiagnostics";

export function useClientDiagnostics(endpoint: string, username: string | null, officeId: string | null, mediaFailed: boolean): void {
  const officeRef = useRef(officeId);
  officeRef.current = officeId;
  useEffect(() => {
    if (!username) return;
    return installClientDiagnostics(endpoint, () => officeRef.current);
  }, [endpoint, username]);
  useEffect(() => {
    if (username && mediaFailed) reportClientDiagnostic("media_error");
  }, [username, mediaFailed]);
}
