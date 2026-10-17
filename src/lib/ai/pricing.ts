// Tarif token Claude API (USD per 1 juta token, first-party). Dipakai untuk estimasi biaya
// di ApiUsageLog. Ini estimasi; tagihan resmi tetap dari Anthropic Console.
export const AI_MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5", inputPerMTok: 5, outputPerMTok: 25, supportsEffort: true },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", inputPerMTok: 2, outputPerMTok: 10, supportsEffort: true },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", inputPerMTok: 1, outputPerMTok: 5, supportsEffort: false },
] as const;

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export function modelInfo(id: string) {
  return AI_MODELS.find((m) => m.id === id) ?? AI_MODELS[0];
}

/** Estimasi biaya dalam micro-USD. Cache read ditagih 10% dari tarif input. */
export function estimateCostMicroUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number },
): number {
  const info = modelInfo(model);
  const input = usage.inputTokens * info.inputPerMTok;
  const output = usage.outputTokens * info.outputPerMTok;
  const cacheRead = (usage.cacheReadTokens ?? 0) * info.inputPerMTok * 0.1;
  const cacheWrite = (usage.cacheWriteTokens ?? 0) * info.inputPerMTok * 1.25;
  return Math.round(input + output + cacheRead + cacheWrite);
}
