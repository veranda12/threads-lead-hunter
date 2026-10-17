import { z } from "zod";
import { parseThreadsPostUrl } from "@/lib/discovery/normalize";
import type { ProviderHealth, RawPost, SearchPage, SearchProvider } from "@/lib/providers/types";

// ManualPostProvider: pengguna menempelkan URL postingan Threads yang ia lihat sendiri
// beserta teksnya. Tidak ada scraping. Data yang diisi manual ditandai sebagai MANUAL_IMPORT
// dan timestamp yang diisi manual ditampilkan sebagai "diisi manual" di UI.

const JAKARTA_OFFSET = "+07:00";

export const manualImportSchema = z.object({
  url: z.string().trim().min(1, "URL wajib diisi").max(500),
  text: z.string().trim().min(10, "Teks postingan minimal 10 karakter").max(5000, "Teks terlalu panjang"),
  // Format input datetime-local (YYYY-MM-DDTHH:mm) diartikan sebagai waktu Asia/Jakarta.
  postedAtLocal: z
    .string()
    .trim()
    .max(25)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type ManualImportInput = z.input<typeof manualImportSchema>;

export type ManualImportResult =
  | { ok: true; post: RawPost; timestampProvided: boolean }
  | { ok: false; errors: Record<string, string> };

export function parseManualImport(input: ManualImportInput): ManualImportResult {
  const parsed = manualImportSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, errors };
  }
  const { url, text, postedAtLocal } = parsed.data;
  const ref = parseThreadsPostUrl(url);
  if (!ref) {
    return { ok: false, errors: { url: "Gunakan URL postingan Threads, contoh https://www.threads.com/@username/post/ABC123" } };
  }
  let timestamp: string | null = null;
  if (postedAtLocal) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(postedAtLocal)) {
      return { ok: false, errors: { postedAtLocal: "Format waktu tidak valid" } };
    }
    timestamp = `${postedAtLocal.length === 16 ? `${postedAtLocal}:00` : postedAtLocal}${JAKARTA_OFFSET}`;
  }
  return {
    ok: true,
    timestampProvided: timestamp !== null,
    post: {
      platform: "threads",
      // Import manual tidak punya media ID resmi, jadi kunci dedup memakai shortcode.
      platformPostId: `shortcode:${ref.shortcode}`,
      shortcode: ref.shortcode,
      text,
      username: ref.username,
      permalink: ref.canonicalUrl,
      timestamp,
      mediaType: null,
      raw: { source: "manual_import", url: ref.canonicalUrl },
    },
  };
}

export class ManualPostProvider implements SearchProvider {
  readonly kind = "MANUAL" as const;
  readonly supportsSearch = false;

  async health(): Promise<ProviderHealth> {
    return { status: "CONNECTED", message: "Import manual selalu tersedia." };
  }

  async search(): Promise<SearchPage> {
    // Provider manual tidak melakukan pencarian; data masuk lewat parseManualImport.
    return { posts: [], nextCursor: null, quotaUnits: 0 };
  }
}
