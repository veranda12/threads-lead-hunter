import { z } from "zod";
import { AiError } from "@/lib/ai/errors";

// Klien Ollama (model lokal). Memakai POST /api/chat dengan `format` berupa JSON Schema
// sehingga output dibatasi ke struktur yang sama dengan jalur Claude, lalu divalidasi ulang dengan Zod.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type OllamaResult<T> = {
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
};

type ChatResponse = {
  model?: string;
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
};

export function toOllamaFormat(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export async function ollamaStructuredChat<S extends z.ZodType>(args: {
  baseUrl: string;
  model: string;
  system: string;
  user: string;
  schema: S;
  maxTokens: number;
  /** Konteks lebih kecil = KV cache lebih kecil = lebih banyak layer muat di GPU. */
  numCtx?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}): Promise<OllamaResult<z.infer<S>>> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const started = Date.now();
  let res: Response;
  try {
    res = await fetchImpl(`${args.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(args.timeoutMs ?? 300_000),
      body: JSON.stringify({
        model: args.model,
        stream: false,
        format: toOllamaFormat(args.schema),
        // Model tetap dimuat 10 menit di antara panggilan dalam satu batch.
        keep_alive: "10m",
        options: { temperature: 0.2, num_predict: args.maxTokens, num_ctx: args.numCtx ?? 4096 },
        messages: [
          { role: "system", content: `${args.system}\n\nBalas hanya dengan satu objek JSON yang sesuai schema.` },
          { role: "user", content: args.user },
        ],
      }),
    });
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new AiError("TIMEOUT", "Ollama tidak merespons sebelum batas waktu. Model mungkin terlalu besar untuk perangkat ini.");
    }
    throw new AiError("API_ERROR", `Ollama tidak bisa dihubungi di ${args.baseUrl}. Pastikan aplikasi Ollama berjalan.`, true);
  }

  const body = (await res.json().catch(() => null)) as ChatResponse | null;
  if (!res.ok || !body || body.error) {
    const msg = body?.error ?? `HTTP ${res.status}`;
    if (res.status === 404 || /not found/i.test(msg)) {
      throw new AiError("API_ERROR", `Model "${args.model}" belum tersedia di Ollama. Jalankan: ollama pull ${args.model}`, true);
    }
    throw new AiError("API_ERROR", `Ollama error: ${msg}`.slice(0, 400));
  }
  if (body.done_reason === "length") {
    throw new AiError("TRUNCATED", "Output Ollama terpotong karena batas token");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body.message?.content ?? "");
  } catch {
    throw new AiError("INVALID_OUTPUT", "Output Ollama bukan JSON yang valid");
  }
  const parsed = args.schema.safeParse(parsedJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AiError("INVALID_OUTPUT", `Output Ollama tidak sesuai schema: ${issue.path.join(".")} ${issue.message}`.slice(0, 400));
  }
  return {
    data: parsed.data,
    model: body.model ?? args.model,
    usage: { inputTokens: body.prompt_eval_count ?? 0, outputTokens: body.eval_count ?? 0 },
    durationMs: Date.now() - started,
  };
}

/** Cek cepat: server hidup dan model sudah di-pull. */
export async function ollamaHealth(baseUrl: string, model: string, fetchImpl: FetchLike = fetch) {
  try {
    const res = await fetchImpl(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false as const, message: `Ollama merespons HTTP ${res.status}` };
    const body = (await res.json()) as { models?: { name?: string; model?: string }[] };
    const names = (body.models ?? []).map((m) => m.name ?? m.model ?? "");
    const wanted = model.includes(":") ? model : `${model}:latest`;
    if (!names.includes(wanted)) return { ok: false as const, message: `Model ${model} belum di-pull. Tersedia: ${names.join(", ") || "tidak ada"}` };
    return { ok: true as const, message: `Ollama siap dengan ${model}` };
  } catch {
    return { ok: false as const, message: `Ollama tidak bisa dihubungi di ${baseUrl}` };
  }
}
