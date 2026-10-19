import { useEffect, useState } from "react";
import { officeIdCopyMessage, officeIdDisplay, type OfficeIdCopyStatus } from "./officeIdentity";

const COPY_FEEDBACK_MS = 4_000;

export function OfficeIdChip({ officeId }: { officeId: string }) {
  const display = officeIdDisplay(officeId);
  const [status, setStatus] = useState<OfficeIdCopyStatus>("idle");
  useEffect(() => setStatus("idle"), [officeId]);
  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => setStatus("idle"), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [status, officeId]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(display.fullId);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };
  const message = officeIdCopyMessage(status);
  return <button type="button" className="office-id-chip" title={display.title} aria-label={display.label} onClick={() => void copy()}>
    <span className="office-id-chip-key" aria-hidden="true">ID</span>
    <code>{display.text}</code>
    <span className={`office-id-chip-feedback${status === "failed" ? " is-error" : ""}`} role="status" aria-live="polite">{message}</span>
  </button>;
}
