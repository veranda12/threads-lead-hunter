import { describe, expect, it } from "vitest";
import { priorityFromScore } from "@/lib/leads/scoring";
import { allowedTransitions, assertTransition, canTransition } from "@/lib/leads/crm";
import { formatPlanPrice, hasPrice, servicePriceSummary, UNPRICED_PHRASE, validatePlanInput } from "@/lib/pricing/format";
import { planQueryBudget, rotateKeywords } from "@/lib/discovery/budget";
import { backoffDelay, withRetry } from "@/lib/retry";
import { decryptSecret, encryptSecret, hashPassword, safeEqual, verifyPassword } from "@/lib/crypto";
import { createSignedRequest, parseSignedRequest } from "@/lib/meta/signed-request";
import { parseThreadsPostUrl } from "@/lib/discovery/normalize";
import { parseManualImport } from "@/lib/providers/manual";

describe("lead score bands", () => {
  it.each([
    [100, "HIGH"],
    [80, "HIGH"],
    [79, "MEDIUM"],
    [60, "MEDIUM"],
    [59, "LOW"],
    [40, "LOW"],
    [39, "IGNORE"],
    [0, "IGNORE"],
    [-10, "IGNORE"],
    [Number.NaN, "IGNORE"],
  ])("skor %d -> %s", (score, p) => expect(priorityFromScore(score)).toBe(p));
});

describe("CRM status transition", () => {
  it("alur normal diizinkan", () => {
    const path = ["NEW", "REVIEWED", "CONTACTED", "REPLIED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });
  it("lompatan yang tidak masuk akal ditolak", () => {
    expect(canTransition("NEW", "WON")).toBe(false);
    expect(canTransition("NEW", "NEGOTIATION")).toBe(false);
    expect(() => assertTransition("WON", "NEW")).toThrow(/tidak diizinkan/);
  });
  it("status yang sama bukan transisi", () => expect(canTransition("NEW", "NEW")).toBe(false));
  it("arsip bisa dibuka kembali", () => expect(allowedTransitions("ARCHIVED")).toContain("REVIEWED"));
});

describe("pricing configuration", () => {
  const plan = (o: Partial<Parameters<typeof formatPlanPrice>[0]>) => ({ name: "x", pricingType: "STARTING_FROM" as const, priceMin: 300000, priceMax: null, active: true, ...o });

  it("landing page mulai Rp300.000", () => expect(formatPlanPrice(plan({}))).toBe("mulai Rp 300.000"));
  it("plan tanpa nominal tidak dianggap punya harga", () => {
    expect(hasPrice(plan({ priceMin: null }))).toBe(false);
    expect(formatPlanPrice(plan({ priceMin: null }))).toBe(UNPRICED_PHRASE);
  });
  it("custom quotation dan plan nonaktif memakai frasa scope", () => {
    expect(formatPlanPrice(plan({ pricingType: "CUSTOM_QUOTE", priceMin: null }))).toBe(UNPRICED_PHRASE);
    expect(servicePriceSummary([plan({ active: false })])).toEqual({ text: UNPRICED_PHRASE, priced: false });
  });
  it("bulanan dan rentang", () => {
    expect(formatPlanPrice(plan({ pricingType: "MONTHLY", priceMin: 150000 }))).toBe("Rp 150.000 per bulan");
    expect(formatPlanPrice(plan({ pricingType: "FIXED", priceMin: 1000000, priceMax: 2000000 }))).toBe("Rp 1.000.000 - Rp 2.000.000");
  });
  it("validasi input harga", () => {
    expect(validatePlanInput({ pricingType: "FIXED", priceMin: 2000, priceMax: 1000 })).toMatch(/maksimum/);
    expect(validatePlanInput({ pricingType: "CUSTOM_QUOTE", priceMin: 1, priceMax: null })).toMatch(/Custom/);
    expect(validatePlanInput({ pricingType: "STARTING_FROM", priceMin: null, priceMax: null })).toBeNull();
  });
});

describe("kuota dan rotasi keyword", () => {
  it("tidak melebihi sisa kuota", () => {
    expect(planQueryBudget({ dailyBudget: 100, usedLast24h: 98, minIntervalMinutes: 30, maxKeywordsPerRun: 12, maxPagesPerKeyword: 2 }).maxQueries).toBe(2);
  });
  it("kuota habis -> nol query", () => {
    expect(planQueryBudget({ dailyBudget: 100, usedLast24h: 100, minIntervalMinutes: 30, maxKeywordsPerRun: 12, maxPagesPerKeyword: 2 }).maxQueries).toBe(0);
  });
  it("jatah per run dibagi rata, tidak semua keyword dicari tiap run", () => {
    const p = planQueryBudget({ dailyBudget: 480, usedLast24h: 0, minIntervalMinutes: 30, maxKeywordsPerRun: 50, maxPagesPerKeyword: 2 });
    expect(p.maxQueries).toBe(15);
    expect(p.keywordSlots).toBe(15);
  });
  it("rotasi mendahulukan yang belum/paling lama dicari", () => {
    const ks = [
      { id: "a", lastSearchedAt: new Date("2026-10-17T10:00:00Z") },
      { id: "b", lastSearchedAt: null },
      { id: "c", lastSearchedAt: new Date("2026-10-17T08:00:00Z") },
    ];
    expect(rotateKeywords(ks, 2).map((k) => k.id)).toEqual(["b", "c"]);
  });
});

describe("retry with backoff", () => {
  it("mengulang error retryable lalu berhasil", async () => {
    let n = 0;
    const res = await withRetry(
      async () => {
        n += 1;
        if (n < 3) throw new Error("flaky");
        return "ok";
      },
      { retries: 3, baseDelayMs: 1, maxDelayMs: 2, isRetryable: () => true, sleep: async () => {} },
    );
    expect(res).toBe("ok");
    expect(n).toBe(3);
  });
  it("tidak mengulang error non-retryable", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n += 1;
          throw new Error("fatal");
        },
        { retries: 3, baseDelayMs: 1, maxDelayMs: 2, isRetryable: () => false, sleep: async () => {} },
      ),
    ).rejects.toThrow("fatal");
    expect(n).toBe(1);
  });
  it("backoff eksponensial dibatasi maxDelay", () => {
    expect(backoffDelay(0, 100, 1000, () => 0)).toBe(50);
    expect(backoffDelay(10, 100, 1000, () => 1)).toBe(1000);
  });
});

describe("crypto", () => {
  const key = Buffer.alloc(32, 1).toString("base64");
  it("token terenkripsi bisa didekripsi dan ciphertext acak", () => {
    const a = encryptSecret("THQV-secret", key);
    expect(a).not.toContain("THQV");
    expect(encryptSecret("THQV-secret", key)).not.toBe(a);
    expect(decryptSecret(a, key)).toBe("THQV-secret");
  });
  it("ciphertext yang diubah gagal didekripsi", () => {
    const a = encryptSecret("x", key).split(".");
    a[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(a.join("."), key)).toThrow();
  });
  it("hash password scrypt", async () => {
    const h = await hashPassword("password-panjang-sekali");
    expect(await verifyPassword("password-panjang-sekali", h)).toBe(true);
    expect(await verifyPassword("salah", h)).toBe(false);
    expect(await verifyPassword("x", "bukan-hash")).toBe(false);
  });
  it("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("Meta signed_request", () => {
  it("signature valid diterima", () => {
    const s = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: 123, issued_at: 1 }, "secret");
    expect(parseSignedRequest(s, "secret")?.user_id).toBe("123");
  });
  it("secret salah atau payload diubah ditolak", () => {
    const s = createSignedRequest({ algorithm: "HMAC-SHA256", user_id: "1" }, "secret");
    expect(parseSignedRequest(s, "other")).toBeNull();
    const [sig] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "999" })).toString("base64url");
    expect(parseSignedRequest(`${sig}.${forged}`, "secret")).toBeNull();
  });
  it("algoritma selain HMAC-SHA256 ditolak", () => {
    expect(parseSignedRequest(createSignedRequest({ algorithm: "none", user_id: "1" }, "secret"), "secret")).toBeNull();
  });
});

describe("manual import", () => {
  it("URL Threads valid diparse", () => {
    expect(parseThreadsPostUrl("https://www.threads.net/@Toko.Kue/post/DAbc123xyz")).toEqual({
      username: "toko.kue",
      shortcode: "DAbc123xyz",
      canonicalUrl: "https://www.threads.com/@toko.kue/post/DAbc123xyz",
    });
  });
  it.each(["http://www.threads.com/@a/post/ABCDE", "https://evil.com/@a/post/ABCDE", "https://www.threads.com/@a", "javascript:alert(1)"])("URL %s ditolak", (u) => {
    expect(parseThreadsPostUrl(u)).toBeNull();
  });
  it("waktu input dianggap WIB", () => {
    const res = parseManualImport({ url: "https://www.threads.com/@a/post/ABCDE1", text: "Butuh website company profile", postedAtLocal: "2026-10-17T19:00" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.post.timestamp).toBe("2026-10-17T19:00:00+07:00");
      expect(res.post.platformPostId).toBe("shortcode:ABCDE1");
    }
  });
  it("teks terlalu pendek dan URL salah menghasilkan error per field", () => {
    const res = parseManualImport({ url: "https://x.com/a", text: "hai" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors)).toContain("text");
  });
});
