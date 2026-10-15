export const CHARACTER_SAVE_TIMEOUT_MS = 15_000;

export function characterSaveError(cause: unknown): string {
  if (cause instanceof Error && cause.name === "TimeoutError") {
    return "Saving your character took too long. The app server may be stopped or unreachable; check your connection and try again.";
  }
  if (cause instanceof Error && cause.name === "AbortError") {
    return "Saving your character was interrupted. Please try again.";
  }
  if (cause instanceof TypeError) {
    return "The browser couldn't reach the character service. The server may be stopped or unreachable, or the request may have been blocked by DNS, TLS, or browser security (such as CORS). Check the app server and connection, then try again.";
  }
  return cause instanceof Error ? cause.message : "Could not save your character. Please try again.";
}
