/**
 * Retry a `fetch()` that failed because the network was unreachable.
 *
 * Use case: Telegram Mini App on flaky mobile data. Normal `fetch()`
 * throws `TypeError: Failed to fetch` (or NetworkError) when the radio
 * drops mid-request. This helper retries with exponential backoff so a
 * 1-2 second outage doesn't lose a journal entry the user just filled in.
 *
 * Crucially, we do NOT retry on HTTP error responses (4xx/5xx). Those
 * reach the caller untouched — retrying a 409/422 in a loop would be
 * wrong. Only true network failures (the fetch promise rejects) trigger
 * a retry.
 *
 * A shared `AbortSignal` can be passed via `init.signal` to cancel the
 * whole retry chain (e.g. component unmount).
 */

export interface RetryFetchOptions {
  /** Maximum attempts including the first try. Default 3. */
  maxAttempts?: number;
  /** Delay before the first retry in ms; doubled each attempt. Default 600. */
  initialDelayMs?: number;
  /** Optional callback fired before each retry (e.g. for toast notices). */
  onRetry?: (attempt: number, error: unknown) => void;
}

export async function retryFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: RetryFetchOptions = {}
): Promise<Response> {
  const { maxAttempts = 3, initialDelayMs = 600, onRetry } = opts;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      // Abort is intentional — bubble it up immediately.
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        init?.signal?.aborted
      ) {
        throw error;
      }
      lastError = error;
      if (attempt === maxAttempts) break;
      onRetry?.(attempt, error);
      await new Promise((resolve) =>
        setTimeout(resolve, initialDelayMs * 2 ** (attempt - 1))
      );
    }
  }
  throw lastError;
}
