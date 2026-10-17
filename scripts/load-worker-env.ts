// Dimuat sebagai import PERTAMA oleh worker, sebelum modul database dievaluasi.
// Worker lokal menulis ke database produksi (Neon), jadi env-nya terpisah dari .env pengembangan.
import { config } from "dotenv";
import { existsSync } from "node:fs";

const file = process.env.WORKER_ENV_FILE ?? ".secrets/worker.env";
if (!existsSync(file)) {
  console.error(`File env worker tidak ditemukan: ${file}. Lihat docs/LOCAL_AI.md`);
  process.exit(1);
}
config({ path: file, override: true, quiet: true });
for (const key of ["DATABASE_URL", "OLLAMA_BASE_URL"]) {
  if (!process.env[key]) {
    console.error(`${key} wajib diisi di ${file}`);
    process.exit(1);
  }
}
