/** Maps an HTTP status code to a user-facing message — never leaks raw codes. */
export function httpErrorMessage(status: number): string {
  if (status >= 500) {
    return "Something went wrong on our side. Please try again in a moment.";
  }
  if (status === 429) {
    return "Too many requests right now. Please wait a moment and try again.";
  }
  if (status === 401 || status === 403) {
    return "Your session expired. Reconnect your Figma account and try again.";
  }
  if (status >= 400) {
    return "We couldn't process that request. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * Turns an unknown thrown value into a user-facing string. fetch() network
 * failures surface as TypeError — those become a connection message rather
 * than leaking the raw "Failed to fetch".
 */
export function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
