export type RetryOptions = {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  isRetryable: (error: unknown) => boolean;
  /** Bila error membawa petunjuk retry-after (ms), dipakai sebagai delay minimum. */
  retryAfterMs?: (error: unknown) => number | undefined;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Batas waktu absolut; retry tidak dilakukan bila delay melewati deadline. */
  deadline?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, random = Math.random): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  // Full jitter di setengah atas, agar tidak terlalu cepat dan tidak serempak.
  return Math.round(exp / 2 + random() * (exp / 2));
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= opts.retries || !opts.isRetryable(error)) throw error;
      const hinted = opts.retryAfterMs?.(error);
      const delay = Math.min(opts.maxDelayMs, Math.max(hinted ?? 0, backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs)));
      if (opts.deadline && Date.now() + delay > opts.deadline) throw error;
      opts.onRetry?.(error, attempt + 1, delay);
      await sleep(delay);
      attempt += 1;
    }
  }
}
