// Seed idempotent: katalog layanan, keyword awal, baris provider, dan akun admin.
// Tidak membuat lead apa pun. Data demo ada di scripts/demo-fixtures.ts dan terpisah.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type KeywordCategory, type PricingType } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/crypto";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

type ServiceSeed = {
  slug: string;
  name: string;
  category: "WEBSITE" | "ENTERPRISE_SOFTWARE" | "TECHNICAL_SERVICE";
  description?: string;
  plans?: { name: string; pricingType: PricingType; priceMin?: number; priceMax?: number; notes?: string }[];
};

// Hanya landing page yang punya harga awal (Rp300.000, sesuai brief). Layanan lain sengaja
// tanpa plan sampai harganya ditetapkan dari dashboard, sehingga AI memakai "menyesuaikan kebutuhan dan scope".
const SERVICES: ServiceSeed[] = [
  {
    slug: "landing-page",
    name: "Landing page",
    category: "WEBSITE",
    description: "Satu halaman untuk promosi produk, jasa, atau campaign",
    plans: [{ name: "Landing page dasar", pricingType: "STARTING_FROM", priceMin: 300_000, notes: "Harga awal, final mengikuti scope" }],
  },
  { slug: "company-profile", name: "Website company profile", category: "WEBSITE" },
  { slug: "website-katalog", name: "Website katalog produk", category: "WEBSITE" },
  { slug: "website-umkm", name: "Website UMKM", category: "WEBSITE" },
  { slug: "website-sekolah-bimbel", name: "Website sekolah dan bimbel", category: "WEBSITE" },
  { slug: "website-klinik", name: "Website klinik dan kesehatan", category: "WEBSITE" },
  { slug: "website-hotel", name: "Website hotel dan hospitality", category: "WEBSITE" },
  { slug: "website-rental", name: "Website rental kendaraan", category: "WEBSITE" },
  { slug: "website-booking", name: "Website booking dan reservasi", category: "WEBSITE" },
  { slug: "ecommerce-custom", name: "E-commerce custom", category: "WEBSITE" },
  { slug: "website-admin-panel", name: "Website dengan admin panel", category: "WEBSITE" },
  { slug: "website-multilingual", name: "Website multilingual", category: "WEBSITE" },
  { slug: "erp", name: "ERP", category: "ENTERPRISE_SOFTWARE" },
  { slug: "hris", name: "HRIS", category: "ENTERPRISE_SOFTWARE" },
  { slug: "payroll", name: "Payroll", category: "ENTERPRISE_SOFTWARE" },
  { slug: "pos", name: "POS (point of sale)", category: "ENTERPRISE_SOFTWARE" },
  { slug: "inventory", name: "Inventory management", category: "ENTERPRISE_SOFTWARE" },
  { slug: "accounting", name: "Accounting", category: "ENTERPRISE_SOFTWARE" },
  { slug: "crm", name: "CRM", category: "ENTERPRISE_SOFTWARE" },
  { slug: "warehouse", name: "Warehouse management", category: "ENTERPRISE_SOFTWARE" },
  { slug: "procurement", name: "Procurement", category: "ENTERPRISE_SOFTWARE" },
  { slug: "freight-forwarding", name: "Freight forwarding", category: "ENTERPRISE_SOFTWARE" },
  { slug: "koperasi", name: "Sistem koperasi dan simpan pinjam", category: "ENTERPRISE_SOFTWARE" },
  { slug: "sistem-keuangan", name: "Sistem keuangan", category: "ENTERPRISE_SOFTWARE" },
  { slug: "custom-enterprise", name: "Custom enterprise application", category: "ENTERPRISE_SOFTWARE" },
  { slug: "backend-api", name: "Backend API development", category: "TECHNICAL_SERVICE" },
  { slug: "spring-boot", name: "Java Spring Boot", category: "TECHNICAL_SERVICE" },
  { slug: "nextjs-react", name: "Next.js / React", category: "TECHNICAL_SERVICE" },
  { slug: "database", name: "Database design dan optimization", category: "TECHNICAL_SERVICE" },
  { slug: "payment-gateway", name: "Integrasi payment gateway", category: "TECHNICAL_SERVICE" },
  { slug: "api-integration", name: "Integrasi API pihak ketiga", category: "TECHNICAL_SERVICE" },
  { slug: "cicd", name: "CI/CD", category: "TECHNICAL_SERVICE" },
  { slug: "modernization", name: "Modernisasi aplikasi", category: "TECHNICAL_SERVICE" },
  { slug: "maintenance", name: "Maintenance dan support", category: "TECHNICAL_SERVICE" },
];

const KEYWORDS: Record<KeywordCategory, string[]> = {
  WEBSITE: [
    "cari jasa website",
    "butuh web developer",
    "bikin landing page",
    "jasa company profile",
    "website bisnis",
    "web toko online",
    "cari freelancer website",
  ],
  ENTERPRISE_SOFTWARE: [
    "cari vendor ERP",
    "sistem HRIS",
    "software payroll",
    "aplikasi inventory",
    "sistem POS",
    "software accounting",
    "aplikasi gudang",
    "aplikasi custom",
  ],
  GENERAL: [
    "cari programmer",
    "butuh developer",
    "rekomendasi software house",
    "freelance project",
    "looking for developer",
    "software development vendor",
  ],
  TECHNICAL: [],
};

async function main() {
  for (const [i, s] of SERVICES.entries()) {
    const service = await db.service.upsert({
      where: { slug: s.slug },
      create: { slug: s.slug, name: s.name, category: s.category, description: s.description, sortOrder: i },
      update: {},
    });
    const planCount = await db.pricingPlan.count({ where: { serviceId: service.id } });
    if (planCount === 0 && s.plans) {
      for (const p of s.plans) {
        await db.pricingPlan.create({
          data: { serviceId: service.id, name: p.name, pricingType: p.pricingType, priceMin: p.priceMin ?? null, priceMax: p.priceMax ?? null, notes: p.notes },
        });
      }
    }
  }

  for (const [category, phrases] of Object.entries(KEYWORDS) as [KeywordCategory, string[]][]) {
    for (const phrase of phrases) {
      await db.searchKeyword.upsert({ where: { phrase }, create: { phrase, category }, update: {} });
    }
  }

  await db.searchProvider.upsert({
    where: { kind: "OFFICIAL_THREADS" },
    create: { kind: "OFFICIAL_THREADS", name: "Threads API resmi" },
    update: {},
  });
  await db.searchProvider.upsert({
    where: { kind: "MANUAL" },
    create: { kind: "MANUAL", name: "Import manual", status: "CONNECTED", statusMessage: "Selalu tersedia", dailyRequestBudget: 0 },
    update: {},
  });

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const resetPassword = process.argv.includes("--reset-admin-password");
  if (email) {
    if (password.length < 12) throw new Error("ADMIN_PASSWORD minimal 12 karakter");
    const existing = await db.user.findUnique({ where: { email } });
    if (!existing) {
      await db.user.create({ data: { email, name: process.env.ADMIN_NAME || "Admin", passwordHash: await hashPassword(password) } });
      console.log(`Admin dibuat: ${email}`);
    } else if (resetPassword) {
      await db.user.update({ where: { email }, data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null } });
      await db.userSession.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
      console.log(`Password admin direset: ${email}`);
    } else {
      console.log(`Admin sudah ada: ${email} (pakai --reset-admin-password untuk mengganti password)`);
    }
  } else {
    console.log("ADMIN_EMAIL kosong, akun admin tidak dibuat");
  }

  console.log(`Seed selesai: ${SERVICES.length} layanan, ${Object.values(KEYWORDS).flat().length} keyword`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
