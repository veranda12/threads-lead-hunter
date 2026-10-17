import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { estimateCostMicroUsd, modelInfo } from "@/lib/ai/pricing";
import { startOfJakartaDay } from "@/lib/time";

import { AiError } from "@/lib/ai/errors";
import { ollamaStructuredChat } from "@/lib/ai/ollama";
import type { AiSettings } from "@/lib/settings";

export { AiError, type AiErrorCode } from "@/lib/ai/errors";

export type AiRuntime = {
  provider: "anthropic" | "ollama";
  model: string;
  /** true bila AI bisa dipanggil dari proses ini (key ada / OLLAMA_BASE_URL ada). */
  available: boolean;
  label: string;
  reason: string;
};

/**
 * Menentukan apakah AI bisa dijalankan di proses ini. Ollama hanya tersedia di mesin yang
 * mengisi OLLAMA_BASE_URL (laptop pengelola); di Vercel kandidat dibiarkan pending untuk worker lokal.
 */
export function aiRuntime(ai: AiSettings): AiRuntime {
  if (ai.provider === "ollama") {
    const base = env.ollamaBaseUrl;
    return {
      provider: "ollama",
      model: ai.ollamaModel,
      available: Boolean(base),
      label: `Ollama lokal (${ai.ollamaModel})`,
      reason: base ? `Ollama di ${base}` : "Dianalisis oleh worker lokal (npm run worker:analyze) di laptop yang menjalankan Ollama",
    };
  }
  return {
    provider: "anthropic",
    model: ai.model,
    available: Boolean(env.anthropicApiKey),
    label: `Claude (${modelInfo(ai.model).label})`,
    reason: env.anthropicApiKey ? "ANTHROPIC_API_KEY terkonfigurasi" : "ANTHROPIC_API_KEY belum diatur",
  };
}

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  const apiKey = env.anthropicApiKey;
  if (!apiKey) return null;
  if (!cached) {
    // SDK sudah melakukan retry dengan backoff untuk 408/409/429/5xx dan error koneksi.
    cached = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
  }
  return cached;
}

export async function tokensUsedToday(now = new Date()): Promise<number> {
  const agg = await db.apiUsageLog.aggregate({
    where: { provider: "ANTHROPIC", createdAt: { gte: startOfJakartaDay(now) } },
    _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true },
  });
  const s = agg._sum;
  return (s.inputTokens ?? 0) + (s.outputTokens ?? 0) + (s.cacheReadTokens ?? 0) + (s.cacheWriteTokens ?? 0);
}

/** Perkiraan kasar token untuk cek budget sebelum request (sekitar 3,5 karakter per token). */
export function estimateTokens(chars: number, maxOutput: number): number {
  return Math.ceil(chars / 3.5) + maxOutput;
}

export type StructuredCallResult<T> = {
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
};

/** Panggilan terstruktur ke provider yang dipilih di Pengaturan. */
export async function structuredCall<S extends z.ZodType>(args: {
  operation: string;
  ai: AiSettings;
  system: string;
  user: string;
  schema: S;
  maxTokens: number;
  /** Hanya untuk Ollama: model lain (mis. classifier kecil) dan ukuran konteks. */
  ollamaModelOverride?: string;
  numCtx?: number;
  runId?: string;
  leadId?: string;
}): Promise<StructuredCallResult<z.infer<S>>> {
  if (args.ai.provider === "ollama") return ollamaCall(args);
  return anthropicCall({ ...args, model: args.ai.model, dailyTokenBudget: args.ai.dailyTokenBudget });
}

async function ollamaCall<S extends z.ZodType>(args: {
  operation: string;
  ai: AiSettings;
  system: string;
  user: string;
  schema: S;
  maxTokens: number;
  ollamaModelOverride?: string;
  numCtx?: number;
  runId?: string;
  leadId?: string;
}): Promise<StructuredCallResult<z.infer<S>>> {
  const baseUrl = env.ollamaBaseUrl;
  if (!baseUrl) throw new AiError("NOT_CONFIGURED", "OLLAMA_BASE_URL belum diatur di proses ini");
  const model = args.ollamaModelOverride || args.ai.ollamaModel;
  const started = Date.now();
  let error: string | null = null;
  let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  try {
    const res = await ollamaStructuredChat({
      baseUrl,
      model,
      system: args.system,
      user: args.user,
      schema: args.schema,
      maxTokens: args.maxTokens,
      numCtx: args.numCtx,
    });
    usage = { ...usage, ...res.usage };
    return { data: res.data, model: `ollama:${res.model}`, usage };
  } catch (e) {
    error = (e as Error).message.slice(0, 400);
    throw e;
  } finally {
    // Model lokal tidak berbiaya API; token tetap dicatat untuk pemantauan, tidak memakai budget harian Claude.
    await db.apiUsageLog
      .create({
        data: {
          provider: "OLLAMA",
          operation: args.operation,
          runId: args.runId,
          leadId: args.leadId,
          model: `ollama:${model}`,
          success: error === null,
          ...usage,
          costMicroUsd: 0,
          durationMs: Date.now() - started,
          error,
        },
      })
      .catch((logError) => console.error("[ai] gagal mencatat usage", logError));
  }
}

async function anthropicCall<S extends z.ZodType>(args: {
  operation: string;
  model: string;
  system: string;
  user: string;
  schema: S;
  maxTokens: number;
  dailyTokenBudget: number;
  runId?: string;
  leadId?: string;
}): Promise<StructuredCallResult<z.infer<S>>> {
  const client = getAnthropic();
  if (!client) throw new AiError("NOT_CONFIGURED", "ANTHROPIC_API_KEY belum diatur");

  const used = await tokensUsedToday();
  const estimate = estimateTokens(args.system.length + args.user.length, args.maxTokens);
  if (used + estimate > args.dailyTokenBudget) {
    throw new AiError("BUDGET_EXCEEDED", `Budget token harian habis (${used.toLocaleString("id-ID")} dari ${args.dailyTokenBudget.toLocaleString("id-ID")})`);
  }

  const info = modelInfo(args.model);
  const started = Date.now();
  let statusCode: number | null = null;
  let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let error: string | null = null;

  try {
    const response = await client.messages.parse({
      model: info.id,
      max_tokens: args.maxTokens,
      system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: args.user }],
      output_config: {
        format: zodOutputFormat(args.schema),
        // Klasifikasi dan draft pendek tidak butuh reasoning panjang; effort rendah menekan biaya.
        ...(info.supportsEffort ? { effort: "low" as const } : {}),
      },
    });
    statusCode = 200;
    usage = {
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    };
    if (response.stop_reason === "refusal") {
      throw new AiError("REFUSAL", "Model menolak memproses postingan ini");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AiError("TRUNCATED", "Output terpotong karena batas max_tokens");
    }
    if (!response.parsed_output) {
      throw new AiError("INVALID_OUTPUT", "Output model tidak sesuai schema");
    }
    return { data: response.parsed_output as z.infer<S>, model: response.model, usage };
  } catch (e) {
    if (e instanceof AiError) {
      error = e.message;
      throw e;
    }
    if (e instanceof Anthropic.RateLimitError) {
      statusCode = 429;
      error = "Rate limit Anthropic API";
      throw new AiError("RATE_LIMITED", error);
    }
    if (e instanceof Anthropic.APIConnectionTimeoutError) {
      error = "Timeout ke Anthropic API";
      throw new AiError("TIMEOUT", error);
    }
    if (e instanceof Anthropic.APIError) {
      statusCode = e.status ?? null;
      error = `Anthropic API error ${e.status ?? ""}: ${e.message}`.slice(0, 400);
      throw new AiError("API_ERROR", error);
    }
    error = (e as Error)?.message?.slice(0, 400) ?? "Unknown error";
    // Zod/parse error dari SDK
    throw new AiError("INVALID_OUTPUT", error);
  } finally {
    await db.apiUsageLog
      .create({
        data: {
          provider: "ANTHROPIC",
          operation: args.operation,
          runId: args.runId,
          leadId: args.leadId,
          model: info.id,
          statusCode,
          success: error === null,
          ...usage,
          costMicroUsd: estimateCostMicroUsd(info.id, usage),
          durationMs: Date.now() - started,
          error,
        },
      })
      .catch((logError) => console.error("[ai] gagal mencatat usage", logError));
  }
}
