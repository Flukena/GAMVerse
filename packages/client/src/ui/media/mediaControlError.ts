export type MediaControlSource = "camera" | "screen_share";
const MEDIA_CONTROL_ERROR_LABEL = "Could not change media state.";

export function mediaControlError(cause: unknown, source?: MediaControlSource): Error {
  const error = cause instanceof Error ? cause : new Error(MEDIA_CONTROL_ERROR_LABEL);
  if (!source || (error.name !== "NotAllowedError" && error.name !== "PermissionDeniedError")) return error;
  const message = source === "camera"
    ? "Camera access was denied. Allow camera access for this site in browser permissions, then try again."
    : "Screen sharing was cancelled or denied. Try again and select a screen or window. If blocked, allow screen recording for this browser in system settings, then restart the browser.";
  return new Error(message, { cause: error });
}
