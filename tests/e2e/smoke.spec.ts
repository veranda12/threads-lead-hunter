import { expect, test, type Page } from "@playwright/test";

// Smoke test end-to-end terhadap build produksi lokal.
// Login memakai ADMIN_EMAIL / ADMIN_PASSWORD dari .env (akun yang dibuat oleh npm run db:seed).
const EMAIL = process.env.E2E_EMAIL ?? process.env.ADMIN_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByRole("heading", { name: "Ringkasan" })).toBeVisible();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("halaman publik", () => {
  test("privacy policy bisa diakses tanpa login, HTTP 200, dwibahasa @mobile", async ({ page }) => {
    const res = await page.goto("/privacy-policy");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Kebijakan Privasi" })).toBeVisible();
    await expect(page.getByText("threads_keyword_search").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Tidak ada pengiriman pesan/ })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole("link", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /No automated messaging/ })).toBeVisible();
  });

  test("formulir penghapusan data tersedia tanpa login @mobile", async ({ page }) => {
    const res = await page.goto("/data-deletion");
    expect(res?.status()).toBe(200);
    await expect(page.getByLabel("Username Threads")).toBeVisible();
    await expectNoHorizontalScroll(page);
    const status = await page.goto("/data-deletion/status?code=DEL-TIDAKADA00");
    expect(status?.status()).toBe(200);
    await expect(page.getByText(/Kode tidak ditemukan/)).toBeVisible();
  });

  test("dashboard mengarahkan ke login bila belum masuk", async ({ page }) => {
    await page.goto("/leads");
    await expect(page).toHaveURL(/\/login\?next=%2Fleads/);
  });

  test("endpoint discovery menolak akses tanpa secret", async ({ request }) => {
    const res = await request.post("/api/internal/discovery/run");
    expect(res.status()).toBe(401);
  });

  test("API dashboard tanpa sesi ditolak", async ({ request }) => {
    const res = await request.get("/api/threads/oauth/start", { maxRedirects: 0 });
    expect(res.status()).toBe(401);
  });
});

test.describe("dashboard", () => {
  test.skip(!EMAIL || !PASSWORD, "ADMIN_EMAIL / ADMIN_PASSWORD belum diatur");

  test("semua halaman utama terbuka tanpa error", async ({ page }) => {
    await login(page);
    const pages: [string, string][] = [
      ["/leads", "Lead fresh"],
      ["/leads/import", "Import postingan manual"],
      ["/pipeline", "Pipeline"],
      ["/keywords", "Keyword"],
      ["/pricing", "Harga layanan"],
      ["/automation", "Otomasi"],
      ["/analytics", "Analitik"],
      ["/privacy-requests", "Permintaan privasi"],
      ["/settings", "Pengaturan"],
    ];
    for (const [path, heading] of pages) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByText("Halaman gagal dimuat")).toHaveCount(0);
    }
  });

  test("import manual memvalidasi URL Threads", async ({ page }) => {
    await login(page);
    await page.goto("/leads/import");
    await page.getByLabel("URL postingan").fill("https://example.com/bukan-threads");
    await page.getByLabel("Teks postingan").fill("Butuh website company profile untuk usaha");
    await page.getByRole("button", { name: "Simpan dan buka" }).click();
    await expect(page.getByText(/Gunakan URL postingan Threads/)).toBeVisible();
  });

  test("layout mobile tidak melebar @mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Hanya untuk viewport mobile");
    await login(page);
    for (const path of ["/", "/leads", "/settings"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalScroll(page);
    }
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByRole("link", { name: "Pipeline" })).toBeVisible();
  });
});
