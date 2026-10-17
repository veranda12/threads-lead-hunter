// DEMO FIXTURE, BUKAN DATA ASLI.
// Hanya untuk visual testing lokal. Semua baris ditandai source = DEMO_FIXTURE, username berprefix "demo_",
// teks berprefix [DEMO], tampil dengan badge "Data demo" di UI, dan tidak dihitung di Analitik.
// Ditolak bila NODE_ENV=production atau DEMO_MODE bukan "true".
//   DEMO_MODE=true npm run demo:seed
//   npm run demo:clear
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { contentHash } from "../src/lib/discovery/normalize";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const mode = process.argv[2];

const FIXTURES = [
  { text: "[DEMO] Ada yang bisa bikinin landing page buat usaha kue rumahan? Pengen yang simpel aja.", hoursAgo: 1, score: 84, priority: "HIGH", category: "WEBSITE", service: "landing-page", intent: "SERVICE_REQUEST" },
  { text: "[DEMO] Nyari vendor untuk bikin aplikasi inventory gudang, sekarang masih pakai Excel dan sering selisih stok.", hoursAgo: 3, score: 78, priority: "MEDIUM", category: "ENTERPRISE_SOFTWARE", service: "inventory", intent: "VENDOR_RECOMMENDATION" },
  { text: "[DEMO] Berapa sih kisaran biaya bikin sistem POS untuk 3 cabang coffee shop?", hoursAgo: 5.5, score: 66, priority: "MEDIUM", category: "ENTERPRISE_SOFTWARE", service: "pos", intent: "PRICE_INQUIRY" },
  { text: "[DEMO] Lowongan: kami membuka posisi full time frontend developer, kirim CV ya.", hoursAgo: 2, score: 12, priority: "IGNORE", category: "OTHER", service: null, intent: "JOB_VACANCY" },
] as const;

async function seed() {
  if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE !== "true") {
    throw new Error("Demo fixture hanya boleh dijalankan lokal dengan DEMO_MODE=true");
  }
  const now = Date.now();
  for (const [i, f] of FIXTURES.entries()) {
    const id = `demo-${i}`;
    const exists = await db.lead.findUnique({ where: { platform_platformPostId: { platform: "threads", platformPostId: id } } });
    if (exists) continue;
    const hash = contentHash(f.text);
    await db.lead.create({
      data: {
        platformPostId: id,
        source: "DEMO_FIXTURE",
        authorUsername: `demo_user_${i + 1}`,
        text: f.text,
        contentHash: hash,
        postedAt: new Date(now - f.hoursAgo * 3600_000),
        freshness: "FRESH",
        analysisStatus: "ANALYZED",
        leadScore: f.score,
        priority: f.priority,
        category: f.category,
        intent: f.intent,
        estimatedService: f.service,
        prefilterScore: 60,
        analyses: {
          create: {
            modelVersion: "demo-fixture",
            promptVersion: "demo",
            contentHash: hash,
            intent: f.intent,
            category: f.category,
            isServiceRequest: f.intent !== "JOB_VACANCY",
            confidence: 0.8,
            leadScore: f.score,
            priority: f.priority,
            urgency: "MEDIUM",
            projectComplexity: "MODERATE",
            budgetType: "NOT_MENTIONED",
            estimatedService: f.service,
            qualificationReason: "[DEMO] Contoh alasan kualifikasi untuk visual testing.",
            recommendedApproach: "[DEMO] Contoh pendekatan.",
            redFlags: [],
            guardNotes: [],
            raw: { demo: true },
          },
        },
        activities: { create: { type: "DISCOVERED", message: "[DEMO] Fixture visual testing" } },
      },
    });
  }
  console.log(`Demo fixture dibuat (${FIXTURES.length} lead bertanda DEMO_FIXTURE).`);
}

async function clear() {
  const res = await db.lead.deleteMany({ where: { source: "DEMO_FIXTURE" } });
  console.log(`${res.count} lead demo dihapus.`);
}

(mode === "seed" ? seed() : mode === "clear" ? clear() : Promise.reject(new Error("Gunakan: seed | clear")))
  .catch((e: Error) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
