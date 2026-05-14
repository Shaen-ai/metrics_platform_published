const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

/**
 * Retry an async function with exponential backoff on transient AI provider errors
 * (overloaded, rate-limited, 529, 503).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label = "AI call",
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      const isRetryable =
        err?.status === 529 ||
        err?.status === 503 ||
        err?.status === 429 ||
        err?.error?.type === "overloaded_error" ||
        (typeof err?.message === "string" &&
          /overloaded|rate.?limit|too many requests|temporarily unavailable/i.test(err.message));

      if (!isRetryable || attempt === MAX_RETRIES) throw err;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(
        `[${label}] Retryable error (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${Math.round(delay)}ms:`,
        err?.message || err?.error?.type || "unknown",
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
