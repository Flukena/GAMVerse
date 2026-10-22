export type MediaControlSource = "camera" | "screen_share" | "microphone";
const MEDIA_CONTROL_ERROR_LABEL = "Could not change media state.";

const MICROPHONE_PERMISSION_ERROR_LABEL = "Microphone access was denied. Allow microphone access for this site in browser permissions, then try again.";
const MICROPHONE_DEVICE_ERROR_LABEL = "Could not open the microphone device. Check that it is connected and available, choose another microphone if needed, then try again.";
const MICROPHONE_CAPTURE_GUIDANCE: Readonly<Record<string, string>> = {
  NotAllowedError: MICROPHONE_PERMISSION_ERROR_LABEL,
  PermissionDeniedError: MICROPHONE_PERMISSION_ERROR_LABEL,
  SecurityError: MICROPHONE_PERMISSION_ERROR_LABEL,
  NotFoundError: MICROPHONE_DEVICE_ERROR_LABEL,
  DevicesNotFoundError: MICROPHONE_DEVICE_ERROR_LABEL,
  NotReadableError: MICROPHONE_DEVICE_ERROR_LABEL,
  TrackStartError: MICROPHONE_DEVICE_ERROR_LABEL,
  AbortError: MICROPHONE_DEVICE_ERROR_LABEL,
  OverconstrainedError: MICROPHONE_DEVICE_ERROR_LABEL,
  ConstraintNotSatisfiedError: MICROPHONE_DEVICE_ERROR_LABEL,
};

export function microphoneCaptureError(cause: unknown): Error | null {
  if (!(cause instanceof Error)) return null;
  const message = Object.hasOwn(MICROPHONE_CAPTURE_GUIDANCE, cause.name) ? MICROPHONE_CAPTURE_GUIDANCE[cause.name] : null;
  return message ? new Error(message, { cause }) : null;
}

export function mediaControlError(cause: unknown, source?: MediaControlSource): Error {
  if (source === "microphone") return microphoneCaptureError(cause) ?? (cause instanceof Error ? cause : new Error(MEDIA_CONTROL_ERROR_LABEL));
  const error = cause instanceof Error ? cause : new Error(MEDIA_CONTROL_ERROR_LABEL);
  if (!source || (error.name !== "NotAllowedError" && error.name !== "PermissionDeniedError")) return error;
  const message = source === "camera"
    ? "Camera access was denied. Allow camera access for this site in browser permissions, then try again."
    : "Screen sharing was cancelled or denied. Try again and select a screen or window. If blocked, allow screen recording for this browser in system settings, then restart the browser.";
  return new Error(message, { cause: error });
}
