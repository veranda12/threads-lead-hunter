export type AiErrorCode =
  | "NOT_CONFIGURED"
  | "BUDGET_EXCEEDED"
  | "REFUSAL"
  | "INVALID_OUTPUT"
  | "TRUNCATED"
  | "API_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    /** Error sementara (layanan mati, timeout, rate limit): lead tetap di antrian untuk dicoba lagi. */
    readonly retryable = code === "RATE_LIMITED" || code === "TIMEOUT",
  ) {
    super(message);
    this.name = "AiError";
  }
}
