import { useEffect, useState } from "react";

const PANEL_EXIT_DURATION_MS = 260;
const REDUCED_MOTION_EXIT_DURATION_MS = 0;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function usePanelPresence(isOpen: boolean, exitDurationMs = PANEL_EXIT_DURATION_MS) {
  const [isMounted, setIsMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      return;
    }
    if (!isMounted) return;

    const durationMs = window.matchMedia(REDUCED_MOTION_QUERY).matches ? REDUCED_MOTION_EXIT_DURATION_MS : exitDurationMs;
    const timeout = window.setTimeout(() => setIsMounted(false), durationMs);
    return () => window.clearTimeout(timeout);
  }, [isOpen, isMounted, exitDurationMs]);

  return isMounted;
}
