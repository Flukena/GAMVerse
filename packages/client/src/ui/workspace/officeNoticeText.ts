const DESK_NETWORK_FAILURE_LABEL = "Could not reach desk management. Check your connection and retry.";
const NETWORK_FAILURE_MESSAGE = /^(?:TypeError:\s*)?(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|Network request failed)$/i;

export function deskNoticeText(message: string): string {
  return NETWORK_FAILURE_MESSAGE.test(message.trim()) ? DESK_NETWORK_FAILURE_LABEL : message;
}
