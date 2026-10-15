import { parseMap2dTravelStatus, updateMap2dTravelFeedback, type Map2dTravelFeedback } from "../../world/map2d/map2dTravelFeedback";
import type { Map2dPoint } from "../../world/map2d/map2dProjection";

export const TRAVEL_RESPONSE_TIMEOUT_MS = 10_000;
const REQUESTING_ROUTE_LABEL = "Requesting route…";
const UPDATING_ROUTE_LABEL = "Updating route… destination marker unavailable";
const ROUTE_TIMEOUT_LABEL = "Route request timed out. Choose a destination to try again.";

export interface TravelFeedbackSnapshot {
  feedback: Map2dTravelFeedback | null;
  requestNotice: string | null;
  requesting: boolean;
}

export class TravelFeedbackTracker {
  private markerCertain = true;
  private pendingDestination: Map2dPoint | null | undefined;
  private value: TravelFeedbackSnapshot = { feedback: null, requestNotice: null, requesting: false };

  get snapshot(): Readonly<TravelFeedbackSnapshot> { return this.value; }

  expectDestination(destination: Map2dPoint | null): boolean {
    if (this.value.requesting) {
      // The room protocol does not include request IDs. Accept the newest
      // destination, but stop claiming that a feedback marker belongs to it.
      this.markerCertain = false;
      this.pendingDestination = null;
      this.value = { feedback: null, requestNotice: UPDATING_ROUTE_LABEL, requesting: true };
      return true;
    }
    // Status events have no request IDs: replacing a live route loses marker correlation.
    if (this.value.feedback?.status === "started") this.markerCertain = false;
    this.pendingDestination = this.markerCertain ? destination : null;
    const requestNotice = this.markerCertain ? REQUESTING_ROUTE_LABEL : UPDATING_ROUTE_LABEL;
    this.value = { feedback: null, requestNotice, requesting: true };
    return true;
  }

  receiveStatus(payload: unknown): boolean {
    const status = parseMap2dTravelStatus(payload);
    if (!status) return false;
    if (status === "started" && this.pendingDestination === undefined) {
      this.markerCertain = false;
      this.pendingDestination = null;
    }
    this.value = {
      feedback: updateMap2dTravelFeedback(this.value.feedback, status, this.pendingDestination),
      requestNotice: null,
      requesting: false,
    };
    this.pendingDestination = undefined;
    return true;
  }

  expire(): void {
    if (!this.value.requesting) return;
    // A delayed response can arrive during any retry; certainty returns only on reset.
    this.markerCertain = false;
    this.pendingDestination = undefined;
    this.value = { feedback: null, requestNotice: ROUTE_TIMEOUT_LABEL, requesting: false };
  }

  reset(): void {
    this.markerCertain = true;
    this.pendingDestination = undefined;
    this.value = { feedback: null, requestNotice: null, requesting: false };
  }
}
