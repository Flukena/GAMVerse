import type { Map2dPoint } from "./map2dProjection";

export type Map2dTravelStatus = "started" | "arrived" | "cancelled" | "blocked" | "unreachable";
export interface Map2dTravelFeedback {
  status: Map2dTravelStatus;
  destination: Map2dPoint | null;
}

const TRAVEL_STATUS_MESSAGES: Record<Map2dTravelStatus, string> = {
  started: "Moving to destination",
  arrived: "Arrived",
  cancelled: "Travel cancelled",
  blocked: "Route blocked. Choose another destination.",
  unreachable: "Can't reach that spot. Choose another destination.",
};

export function parseMap2dTravelStatus(payload: unknown): Map2dTravelStatus | null {
  if (typeof payload !== "object" || payload === null || !("status" in payload)) return null;
  switch (payload.status) {
    case "started": case "arrived": case "cancelled": case "blocked": case "unreachable":
      return payload.status;
    default:
      return null;
  }
}

export function updateMap2dTravelFeedback(previous: Map2dTravelFeedback | null,
  status: Map2dTravelStatus, destination?: Map2dPoint | null): Map2dTravelFeedback {
  const activeDestination = destination === undefined ? previous?.destination ?? null : destination;
  return { status, destination: status === "started" ? activeDestination : null };
}

export function map2dTravelMessage(feedback: Map2dTravelFeedback): string {
  return TRAVEL_STATUS_MESSAGES[feedback.status];
}
