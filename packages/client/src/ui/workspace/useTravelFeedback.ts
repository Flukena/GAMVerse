import { useCallback, useEffect, useRef, useState } from "react";
import type { Map2dPoint } from "../../world/map2d/map2dProjection";
import { TRAVEL_RESPONSE_TIMEOUT_MS, TravelFeedbackTracker } from "./travelFeedbackTracker";

export function useTravelFeedback() {
  const [tracker] = useState(() => new TravelFeedbackTracker());
  const [snapshot, setSnapshot] = useState(tracker.snapshot);
  const responseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearResponseTimer = useCallback(() => {
    clearTimeout(responseTimer.current);
    responseTimer.current = undefined;
  }, []);
  useEffect(() => clearResponseTimer, [clearResponseTimer]);

  const expectDestination = useCallback((destination: Map2dPoint | null): boolean => {
    const accepted = tracker.expectDestination(destination);
    setSnapshot(tracker.snapshot);
    if (accepted) {
      clearResponseTimer();
      responseTimer.current = setTimeout(() => {
        tracker.expire();
        setSnapshot(tracker.snapshot);
        responseTimer.current = undefined;
      }, TRAVEL_RESPONSE_TIMEOUT_MS);
    }
    return accepted;
  }, [clearResponseTimer, tracker]);

  const receiveStatus = useCallback((payload: unknown) => {
    if (!tracker.receiveStatus(payload)) return;
    clearResponseTimer();
    setSnapshot(tracker.snapshot);
  }, [clearResponseTimer, tracker]);

  const reset = useCallback(() => {
    clearResponseTimer();
    tracker.reset();
    setSnapshot(tracker.snapshot);
  }, [clearResponseTimer, tracker]);
  return { ...snapshot, expectDestination, receiveStatus, reset };
}
