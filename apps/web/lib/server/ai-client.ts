const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch for calls to the AI service that survives its cold start. Free hosting suspends idle services and
 * answers 502/503/504 (or drops the connection) while one boots, so those responses are retried with a
 * growing delay for about a minute and a half. Any other response, including 4xx and 429, is returned as is.
 */
export async function fetchWithRetry(url: string, init: RequestInit, attempts = 7): Promise<Response> {
  let lastResponse: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
      if (![502, 503, 504].includes(response.status)) return response;
      lastResponse = response;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) await sleep(Math.min(5_000 * (attempt + 1), 20_000));
  }
  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error('AI service is unreachable.');
}
