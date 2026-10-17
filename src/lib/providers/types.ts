export type ProviderKind = "OFFICIAL_THREADS" | "MANUAL";

export type ProviderStatus =
  | "CONNECTED"
  | "PERMISSION_REQUIRED"
  | "TOKEN_EXPIRED"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "NOT_CONFIGURED";

export const PROVIDER_STATUS_LABELS: Record<ProviderStatus, string> = {
  CONNECTED: "Terhubung",
  PERMISSION_REQUIRED: "Butuh izin",
  TOKEN_EXPIRED: "Token kedaluwarsa",
  RATE_LIMITED: "Kena rate limit",
  PROVIDER_ERROR: "Error provider",
  NOT_CONFIGURED: "Belum dikonfigurasi",
};

/** Postingan mentah dari provider, sebelum validasi timestamp dan dedup. */
export type RawPost = {
  platform: "threads";
  platformPostId: string;
  shortcode: string | null;
  text: string | null;
  username: string | null;
  permalink: string | null;
  /** Nilai mentah dari provider; divalidasi oleh checkPostTimestamp. */
  timestamp: unknown;
  mediaType: string | null;
  raw: Record<string, unknown>;
};

export type SearchQuery = {
  keyword: string;
  since: Date;
  until: Date;
  limit: number;
  cursor?: string | null;
  signal?: AbortSignal;
};

export type SearchPage = {
  posts: RawPost[];
  nextCursor: string | null;
  /** Unit kuota yang terpakai (Threads: query tanpa hasil tidak dihitung). */
  quotaUnits: number;
};

export type ProviderHealth = { status: ProviderStatus; message: string };

export interface SearchProvider {
  readonly kind: ProviderKind;
  readonly supportsSearch: boolean;
  health(): Promise<ProviderHealth>;
  search(query: SearchQuery): Promise<SearchPage>;
}

export type ProviderErrorCode = Exclude<ProviderStatus, "CONNECTED"> | "TIMEOUT";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly options: { retryable?: boolean; retryAfterMs?: number; httpStatus?: number; providerCode?: number } = {},
  ) {
    super(message);
    this.name = "ProviderError";
  }
  get retryable(): boolean {
    return this.options.retryable ?? false;
  }
}

export function statusFromErrorCode(code: ProviderErrorCode): ProviderStatus {
  return code === "TIMEOUT" ? "PROVIDER_ERROR" : code;
}
