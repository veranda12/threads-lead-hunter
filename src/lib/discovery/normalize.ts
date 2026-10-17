import { createHash } from "node:crypto";

export function normalizeText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** Hash konten untuk mendeteksi perubahan teks (re-analisis hanya jika hash berubah). */
export function contentHash(text: string): string {
  return createHash("sha256").update(normalizeText(text).toLowerCase(), "utf8").digest("hex");
}

export function normalizeUsername(username: string): string {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

export function usernameHash(username: string): string {
  return createHash("sha256").update(`threads:${normalizeUsername(username)}`, "utf8").digest("hex");
}

export function threadsProfileUrl(username: string | null | undefined): string | null {
  if (!username) return null;
  const u = normalizeUsername(username);
  if (!/^[a-z0-9._]{1,30}$/.test(u)) return null;
  return `https://www.threads.com/@${u}`;
}

const THREADS_HOSTS = new Set(["threads.net", "www.threads.net", "threads.com", "www.threads.com"]);

export type ParsedThreadsUrl = { username: string; shortcode: string; canonicalUrl: string };

/**
 * Parse URL postingan Threads: https://www.threads.com/@user/post/SHORTCODE
 * Hanya domain resmi Threads yang diterima.
 */
export function parseThreadsPostUrl(input: string): ParsedThreadsUrl | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !THREADS_HOSTS.has(url.hostname.toLowerCase())) return null;
  const m = /^\/@([A-Za-z0-9._]{1,30})\/post\/([A-Za-z0-9_-]{5,64})\/?$/.exec(url.pathname);
  if (!m) return null;
  const username = m[1].toLowerCase();
  const shortcode = m[2];
  return { username, shortcode, canonicalUrl: `https://www.threads.com/@${username}/post/${shortcode}` };
}
