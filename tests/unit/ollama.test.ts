import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ollamaHealth, ollamaStructuredChat, toOllamaFormat } from "@/lib/ai/ollama";
import { AiError } from "@/lib/ai/errors";
import { analysisOutputSchema } from "@/lib/ai/schemas";

const schema = z.object({ intent: z.enum(["A", "B"]), score: z.number() });
const base = { baseUrl: "http://ollama.test", model: "qwen2.5:7b", system: "sys", user: "post", schema, maxTokens: 500 };

function reply(body: unknown, status = 200) {
  return async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("ollamaStructuredChat", () => {
  it("mengirim JSON schema sebagai format dan mem-parse hasil valid", async () => {
    let sent: Record<string, unknown> = {};
    const res = await ollamaStructuredChat({
      ...base,
      fetchImpl: async (url, init) => {
        expect(url).toBe("http://ollama.test/api/chat");
        sent = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ model: "qwen2.5:7b", message: { content: '{"intent":"A","score":80}' }, done_reason: "stop", prompt_eval_count: 120, eval_count: 30 }));
      },
    });
    expect(res.data).toEqual({ intent: "A", score: 80 });
    expect(res.usage).toEqual({ inputTokens: 120, outputTokens: 30 });
    expect(sent.stream).toBe(false);
    expect((sent.format as { properties: object }).properties).toHaveProperty("intent");
  });

  it("output yang tidak sesuai schema ditolak sebagai INVALID_OUTPUT", async () => {
    const err = await ollamaStructuredChat({ ...base, fetchImpl: reply({ message: { content: '{"intent":"C","score":1}' } }) }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.code).toBe("INVALID_OUTPUT");
  });

  it("bukan JSON ditolak", async () => {
    await expect(ollamaStructuredChat({ ...base, fetchImpl: reply({ message: { content: "maaf saya tidak bisa" } }) })).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });

  it("output terpotong ditandai TRUNCATED", async () => {
    await expect(ollamaStructuredChat({ ...base, fetchImpl: reply({ message: { content: '{"intent":' }, done_reason: "length" }) })).rejects.toMatchObject({ code: "TRUNCATED" });
  });

  it("model belum di-pull memberi instruksi yang jelas", async () => {
    await expect(ollamaStructuredChat({ ...base, fetchImpl: reply({ error: "model 'qwen2.5:7b' not found" }, 404) })).rejects.toThrow(/ollama pull qwen2.5:7b/);
  });

  it("Ollama mati -> API_ERROR, lambat -> TIMEOUT", async () => {
    await expect(ollamaStructuredChat({ ...base, fetchImpl: async () => Promise.reject(new TypeError("fetch failed")) })).rejects.toMatchObject({ code: "API_ERROR" });
    const hang = (_u: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("t"), { name: "TimeoutError" }))));
    await expect(ollamaStructuredChat({ ...base, fetchImpl: hang, timeoutMs: 20 })).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("schema analisis lengkap bisa dikonversi ke JSON schema Ollama", () => {
    const f = toOllamaFormat(analysisOutputSchema) as { type: string; required: string[] };
    expect(f.type).toBe("object");
    expect(f.required).toContain("leadScore");
    expect(f).not.toHaveProperty("$schema");
  });
});

describe("ollamaHealth", () => {
  it("siap bila model ada", async () => {
    expect((await ollamaHealth("http://o", "qwen2.5:7b", reply({ models: [{ name: "qwen2.5:7b" }] }))).ok).toBe(true);
  });
  it("memberi tahu bila model belum di-pull", async () => {
    const h = await ollamaHealth("http://o", "qwen2.5:7b", reply({ models: [{ name: "llama3.2:latest" }] }));
    expect(h.ok).toBe(false);
    expect(h.message).toMatch(/belum di-pull/);
  });
});
