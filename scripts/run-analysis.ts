// Worker analisis AI lokal (Ollama). Memproses kandidat pending di database produksi.
//   npm run worker:analyze
// Dijadwalkan lewat Windows Task Scheduler: lihat scripts/windows/register-analysis-task.ps1
import "./load-worker-env";
import { runLocalAnalysis } from "../src/lib/discovery/pipeline";
import { db } from "../src/lib/db";

runLocalAnalysis()
  .then((summary) => {
    const c = summary.counters;
    console.log(
      `[${new Date().toISOString()}] ${summary.status}: ${c.analyzed} dianalisis, ${c.draftsGenerated} draft, ${c.analysisPending} masih pending, ${c.errorCount} error${summary.error ? ` (${summary.error})` : ""}`,
    );
    process.exitCode = summary.status === "FAILED" ? 1 : 0;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
