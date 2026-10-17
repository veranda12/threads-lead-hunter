// Worker terpisah: menjalankan pipeline discovery langsung tanpa melewati HTTP.
// Pakai ini bila run melebihi batas durasi function Vercel. Butuh DATABASE_URL dan secret yang sama.
//   npm run worker:discovery -- --execution-id=gh-123-1
import "dotenv/config";
import { runDiscovery } from "../src/lib/discovery/pipeline";
import { db } from "../src/lib/db";

const arg = process.argv.find((a) => a.startsWith("--execution-id="));
const executionId = arg ? `worker-${arg.split("=")[1]}` : undefined;

runDiscovery({ trigger: "WORKER", executionId })
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = summary.status === "FAILED" ? 1 : 0;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
