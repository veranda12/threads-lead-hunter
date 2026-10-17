import "dotenv/config";

// Semua test memakai database terpisah dan secret palsu. Tidak ada panggilan ke API eksternal.
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("TEST_DATABASE_URL wajib diatur untuk menjalankan test");
if (testDb === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL tidak boleh sama dengan database utama");
}
process.env.DATABASE_URL = testDb;
process.env.ANTHROPIC_API_KEY = "";
process.env.CRON_SECRET = "test-cron-secret-0123456789abcdef0123456789";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.THREADS_APP_ID = "1234567890";
process.env.THREADS_APP_SECRET = "test-app-secret";
process.env.APP_URL = "https://leads.example.com";
process.env.OLLAMA_BASE_URL = "";
