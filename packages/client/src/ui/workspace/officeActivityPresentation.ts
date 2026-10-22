type OfficeActivityType = "office.join" | "office.leave" | "meeting.enter" | "meeting.leave" | "private.enter" | "private.leave" | "bubble.enter" | "bubble.leave" | "vehicle.enter" | "vehicle.leave";
export type OfficeActivity = { id: string; actorUsername: string; activityType: OfficeActivityType; locationName: string | null; occurredAt: string };
export const officeActivityLabels: Record<OfficeActivityType, string> = {
  "office.join": "Entered the office",
  "office.leave": "Left the office",
  "meeting.enter": "Entered the meeting area",
  "meeting.leave": "Left the meeting area",
  "private.enter": "Entered a private desk",
  "private.leave": "Left a private desk",
  "bubble.enter": "Joined a voice bubble",
  "bubble.leave": "Left a voice bubble",
  "vehicle.enter": "Started driving",
  "vehicle.leave": "Stopped driving",
};
const UUID_LOCATION_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const CAMPUS_CAR_PREFIX_PATTERN = /^campus-car-/;
const VEHICLE_PREFIX_PATTERN = /^(vehicle|car)-/;
const WORD_START_PATTERN = /\b[a-z]/g;

export const officeActivityLocation = (activity: OfficeActivity) => {
  const value = activity.locationName;
  if (!value || UUID_LOCATION_PATTERN.test(value)) return "";
  const vehicleName = value.replace(CAMPUS_CAR_PREFIX_PATTERN, "").replace(VEHICLE_PREFIX_PATTERN, "");
  return vehicleName !== value || VEHICLE_PREFIX_PATTERN.test(value)
    ? vehicleName.replaceAll("-", " ").replace(WORD_START_PATTERN, (letter) => letter.toUpperCase())
    : value;
};
