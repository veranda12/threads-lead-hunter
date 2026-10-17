// Rekam screencast App Review (threads_keyword_search) terhadap aplikasi production dengan Playwright.
// Setiap adegan diberi keterangan bahasa Inggris untuk reviewer Meta.
//
//   npx tsx scripts/record-app-review.ts part-a   -> login, OAuth, uji keyword search, keyword, import manual
//   npm run worker:analyze                        -> analisis lead hasil import (di luar rekaman)
//   npx tsx scripts/record-app-review.ts part-b   -> hasil analisis, draft, privacy, penghapusan data
//
// Login memakai sesi sementara dari .secrets/screencast-session.txt (tidak mengetik password).
// Data postingan untuk adegan import dibaca dari .secrets/screencast-post.json (postingan milik penguji sendiri).
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const BASE = process.env.REVIEW_BASE_URL ?? "https://threads-lead-hunter-five.vercel.app";
const OUT = "logs/app-review";
const part = process.argv[2];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function caption(page: Page, text: string, step?: string) {
  await page.evaluate(
    ({ text, step }) => {
      document.getElementById("review-caption")?.remove();
      const el = document.createElement("div");
      el.id = "review-caption";
      el.style.cssText =
        "position:fixed;left:24px;right:24px;bottom:20px;z-index:2147483647;background:rgba(17,24,22,.92);color:#f4f3ef;" +
        "font:500 17px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;padding:14px 18px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25)";
      el.innerHTML = (step ? `<div style="font-size:12px;letter-spacing:.06em;color:#9fd4bf;margin-bottom:4px">${step}</div>` : "") + text;
      document.body.appendChild(el);
    },
    { text, step },
  );
}

async function card(page: Page, title: string, sub: string, ms = 3500) {
  await page.setContent(
    `<html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#1f5a4a;color:#f4f3ef;font-family:system-ui,'Segoe UI',sans-serif;text-align:center">
      <div style="font-size:44px;font-weight:700;letter-spacing:-.02em">${title}</div>
      <div style="margin-top:14px;font-size:20px;opacity:.85;max-width:900px;line-height:1.5">${sub}</div></body></html>`,
  );
  await sleep(ms);
}

async function smoothScroll(page: Page, y: number) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), y);
  await sleep(1200);
}

async function scrollToText(page: Page, text: string) {
  const el = page.getByText(text, { exact: false }).first();
  await el.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy({ top: -120, behavior: "smooth" }));
  await sleep(1000);
}

async function main() {
  if (part !== "part-a" && part !== "part-b") throw new Error("Gunakan: part-a | part-b");
  const token = readFileSync(".secrets/screencast-session.txt", "utf8").trim();
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ args: ["--disable-gpu", "--use-gl=swiftshader"] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
    locale: "en-US",
  });
  const page = await context.newPage();
  const url = new URL(BASE);

  if (part === "part-a") {
    await card(page, "Threads Lead Hunter", "Use of the <b>threads_keyword_search</b> permission<br>Internal single-user tool for a freelance software developer");

    // 1. Login
    await page.goto(`${BASE}/login`);
    await caption(page, "The dashboard is private and has a single user: the operator, a freelance software developer. Credentials are not shown in this recording.", "1 · SIGN IN");
    await sleep(4500);
    await context.addCookies([{ name: "__Host-tlh_session", value: token, domain: url.hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    await page.goto(`${BASE}/`);
    await caption(page, "Overview after sign-in. No leads are shown yet because public keyword search is pending approval.", "1 · SIGN IN");
    await sleep(4500);

    // 2. OAuth
    await page.goto(`${BASE}/settings#integrasi`);
    await scrollToText(page, "Integrasi Threads");
    await caption(page, "The operator connected their own Threads account (@deni_maulana1) with OAuth, granting <b>threads_basic</b> and <b>threads_keyword_search</b>. The access token is encrypted at rest.", "2 · CONNECT THREADS (OAUTH)");
    await sleep(6000);
    const connect = page.getByRole("link", { name: /Hubungkan (ulang )?akun Threads/ });
    await connect.scrollIntoViewIfNeeded();
    await caption(page, "Clicking “Connect Threads account” starts the standard Threads authorization flow.", "2 · CONNECT THREADS (OAUTH)");
    await sleep(2500);
    await connect.click();
    // Halaman Threads dirender di sisi klien dan butuh beberapa detik di browser headless.
    await page.getByText(/Log in|Allow|Izinkan/i).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
    await sleep(1500);
    await caption(
      page,
      "Threads sign-in and consent screen for scopes <b>threads_basic</b> and <b>threads_keyword_search</b>. The operator signs in with their own account here (not recorded); Threads then redirects back to the app with an authorization code.",
      "2 · CONNECT THREADS (OAUTH)",
    );
    await sleep(7000);

    // 3. Keyword search call
    await page.goto(`${BASE}/settings#integrasi`);
    const kw = page.locator("#test-keyword");
    await kw.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy({ top: -160, behavior: "smooth" }));
    await caption(page, "The app calls <b>GET /v1.0/keyword_search</b> with search_type=RECENT. Before approval, Threads only returns the tester's own posts.", "3 · KEYWORD SEARCH");
    await sleep(3500);
    await kw.fill("");
    await kw.pressSequentially("Cut-off tinggal besok", { delay: 70 });
    await sleep(600);
    await page.getByRole("button", { name: "Jalankan uji" }).click();
    await page.getByText(/Berhasil: Threads API mengembalikan|Butuh izin|Token|Error/).first().waitFor({ timeout: 30_000 });
    await page.evaluate(() => window.scrollBy({ top: 220, behavior: "smooth" }));
    await caption(page, "Results returned by the Keyword Search API: post text, username, timestamp, and permalink. Results are displayed to the operator only.", "3 · KEYWORD SEARCH");
    await sleep(7000);

    // 4. Keywords
    await page.goto(`${BASE}/keywords`);
    await caption(page, "The service-related keywords the operator searches for (e.g. “looking for a web developer”). Searches run at most every 30 minutes and stay within the 2,200 queries / 24h limit.", "4 · KEYWORDS");
    await sleep(6500);

    // 5. Import the found post
    const post = JSON.parse(readFileSync(".secrets/screencast-post.json", "utf8")) as { permalink: string; text: string; timestamp: string };
    await page.goto(`${BASE}/leads/import`);
    await caption(page, "A post found by the search can be saved for review. Only these fields are stored: post ID, text, username, permalink, timestamp, media type, shortcode.", "5 · SAVE A POST FOR REVIEW");
    await sleep(3000);
    await page.locator("#url").pressSequentially(post.permalink, { delay: 25 });
    await page.locator("#text").fill(post.text);
    const posted = new Date(new Date(post.timestamp.replace(/\+0000$/, "Z")).getTime() + 7 * 3600_000).toISOString().slice(0, 16);
    await page.locator("#postedAtLocal").fill(posted);
    await sleep(2000);
    await page.getByRole("button", { name: "Simpan dan buka" }).click();
    await page.waitForURL(/\/leads\/[a-z0-9]+$/, { timeout: 30_000 });
    await caption(page, "The saved post now waits for analysis. Analysis runs on the operator's own computer with a local language model.", "5 · SAVE A POST FOR REVIEW");
    await sleep(5000);
    writeFileSync(`${OUT}/lead-url.txt`, page.url());
  } else {
    const leadUrl = readFileSync(`${OUT}/lead-url.txt`, "utf8").trim();
    await context.addCookies([{ name: "__Host-tlh_session", value: token, domain: url.hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);

    // 6. Analysis and drafts
    await page.goto(leadUrl);
    await caption(page, "Each post receives a relevance assessment. This is the tester's own post, so it is not classified as someone asking for development services.", "6 · REVIEW");
    await sleep(6500);
    await scrollToText(page, "Analisis AI");
    await sleep(5000);
    await scrollToText(page, "Draft DM");
    await caption(page, "<b>The app never sends messages, replies, likes, follows, or posts.</b> For real service requests it suggests a reply that the operator copies and sends manually from the Threads app.", "6 · REVIEW");
    await sleep(7000);

    // 7. Privacy and deletion
    await page.goto(`${BASE}/privacy-policy?lang=en`);
    await caption(page, "Public privacy policy: data collected, purpose, retention periods, and how to request deletion.", "7 · PRIVACY & DATA DELETION");
    await sleep(3500);
    await smoothScroll(page, 900);
    await sleep(2500);
    await page.goto(`${BASE}/data-deletion`);
    await caption(page, "Anyone whose post was stored can request deletion here. The app also implements Meta's Data Deletion and Uninstall callbacks.", "7 · PRIVACY & DATA DELETION");
    await sleep(6000);

    await card(page, "Thank you", "Threads Lead Hunter · threads_keyword_search · search only, no automated messaging or posting", 3500);
  }

  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();
  if (videoPath && existsSync(videoPath)) {
    const target = `${OUT}/${part}.webm`;
    writeFileSync(target, readFileSync(videoPath));
    console.log(`video: ${target}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
