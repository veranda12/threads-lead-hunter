import { keywordSearch, type FetchLike } from "@/lib/providers/threads-api";
import { ProviderError, type ProviderHealth, type SearchPage, type SearchProvider, type SearchQuery } from "@/lib/providers/types";

export type ThreadsIntegrationState = {
  appConfigured: boolean;
  hasToken: boolean;
  tokenExpiresAt: Date | null;
  keywordSearchApproved: boolean;
  rateLimitedUntil: Date | null;
  lastStoredStatus: string | null;
  lastStoredMessage: string | null;
};

/**
 * Status integrasi dihitung dari keadaan nyata, bukan diasumsikan.
 * Urutan prioritas: konfigurasi app -> token -> kedaluwarsa -> izin -> rate limit -> error terakhir.
 */
export function evaluateThreadsHealth(s: ThreadsIntegrationState, now: Date): ProviderHealth {
  if (!s.appConfigured) {
    return { status: "NOT_CONFIGURED", message: "THREADS_APP_ID dan THREADS_APP_SECRET belum diatur." };
  }
  if (!s.hasToken) {
    return { status: "NOT_CONFIGURED", message: "Akun Threads belum dihubungkan lewat OAuth." };
  }
  if (s.tokenExpiresAt && s.tokenExpiresAt.getTime() <= now.getTime()) {
    return { status: "TOKEN_EXPIRED", message: "Long-lived token sudah kedaluwarsa. Hubungkan ulang akun Threads." };
  }
  if (s.lastStoredStatus === "TOKEN_EXPIRED") {
    return { status: "TOKEN_EXPIRED", message: s.lastStoredMessage ?? "Token ditolak oleh Threads API." };
  }
  if (!s.keywordSearchApproved) {
    return {
      status: "PERMISSION_REQUIRED",
      message:
        "Permission threads_keyword_search belum ditandai disetujui. Tanpa approval, Keyword Search hanya mengembalikan postingan milik akun sendiri.",
    };
  }
  if (s.lastStoredStatus === "PERMISSION_REQUIRED") {
    return { status: "PERMISSION_REQUIRED", message: s.lastStoredMessage ?? "Threads API menolak karena izin." };
  }
  if (s.rateLimitedUntil && s.rateLimitedUntil.getTime() > now.getTime()) {
    return { status: "RATE_LIMITED", message: `Rate limit aktif sampai ${s.rateLimitedUntil.toISOString()}.` };
  }
  if (s.lastStoredStatus === "PROVIDER_ERROR") {
    return { status: "PROVIDER_ERROR", message: s.lastStoredMessage ?? "Error terakhir dari Threads API." };
  }
  return { status: "CONNECTED", message: "Siap melakukan pencarian." };
}

export class OfficialThreadsProvider implements SearchProvider {
  readonly kind = "OFFICIAL_THREADS" as const;
  readonly supportsSearch = true;

  constructor(
    private readonly deps: {
      state: ThreadsIntegrationState;
      accessToken: string | null;
      fetchImpl?: FetchLike;
      now?: () => Date;
      timeoutMs?: number;
    },
  ) {}

  async health(): Promise<ProviderHealth> {
    return evaluateThreadsHealth(this.deps.state, this.deps.now?.() ?? new Date());
  }

  async search(query: SearchQuery): Promise<SearchPage> {
    const health = await this.health();
    // PROVIDER_ERROR sebelumnya tidak memblokir percobaan baru; status lain memblokir.
    if (health.status !== "CONNECTED" && health.status !== "PROVIDER_ERROR") {
      throw new ProviderError(health.status, health.message);
    }
    if (!this.deps.accessToken) throw new ProviderError("NOT_CONFIGURED", "Access token tidak tersedia");
    return keywordSearch(this.deps.accessToken, query, { fetchImpl: this.deps.fetchImpl, timeoutMs: this.deps.timeoutMs });
  }
}
