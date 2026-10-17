// Akses environment variable yang terpusat. Hanya dipakai di server.
// Nilai yang wajib (DATABASE_URL, ENCRYPTION_KEY, CRON_SECRET) divalidasi saat dipakai,
// bukan saat import, agar build tetap berjalan tanpa secret produksi.

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export const env = {
  get appUrl(): string {
    return (read("APP_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
  },
  /** Hanya diisi di mesin yang menjalankan Ollama (laptop pengelola), tidak di Vercel. */
  get ollamaBaseUrl() {
    return read("OLLAMA_BASE_URL")?.replace(/\/+$/, "");
  },
  get anthropicApiKey() {
    return read("ANTHROPIC_API_KEY");
  },
  get threadsAppId() {
    return read("THREADS_APP_ID");
  },
  get threadsAppSecret() {
    return read("THREADS_APP_SECRET");
  },
  get threadsRedirectUri(): string {
    return read("THREADS_REDIRECT_URI") ?? `${env.appUrl}/api/threads/oauth/callback`;
  },
  get cronSecret() {
    return read("CRON_SECRET");
  },
  get encryptionKey() {
    return read("ENCRYPTION_KEY");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get demoMode() {
    return read("DEMO_MODE") === "true" && process.env.NODE_ENV !== "production";
  },
};

export function requireEnv(name: string): string {
  const value = read(name);
  if (!value) throw new Error(`Environment variable ${name} belum diatur`);
  return value;
}
