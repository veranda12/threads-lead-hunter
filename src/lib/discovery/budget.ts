// Perencanaan kuota query Threads per eksekusi. Pure function agar mudah diuji.

export type QueryBudgetInput = {
  dailyBudget: number;
  usedLast24h: number;
  minIntervalMinutes: number;
  maxKeywordsPerRun: number;
  maxPagesPerKeyword: number;
};

export type QueryBudgetPlan = { maxQueries: number; keywordSlots: number; reason: string };

export function planQueryBudget(i: QueryBudgetInput): QueryBudgetPlan {
  const remaining = Math.max(0, i.dailyBudget - i.usedLast24h);
  if (remaining === 0) return { maxQueries: 0, keywordSlots: 0, reason: "Kuota 24 jam habis" };
  const runsPerDay = Math.max(1, Math.floor((24 * 60) / Math.max(5, i.minIntervalMinutes)));
  // Jatah rata-rata per run, diberi ruang 50% untuk mengejar run yang terlewat.
  const fairShare = Math.max(1, Math.ceil((i.dailyBudget / runsPerDay) * 1.5));
  const hardCap = i.maxKeywordsPerRun * i.maxPagesPerKeyword;
  const maxQueries = Math.min(remaining, fairShare, hardCap);
  const keywordSlots = Math.min(i.maxKeywordsPerRun, maxQueries);
  const reason =
    maxQueries === remaining ? "Dibatasi sisa kuota 24 jam" : maxQueries === fairShare ? "Dibatasi jatah rata-rata per run" : "Dibatasi konfigurasi per run";
  return { maxQueries, keywordSlots, reason };
}

/** Rotasi: keyword yang paling lama tidak dicari didahulukan; yang belum pernah dicari paling depan. */
export function rotateKeywords<T extends { id: string; lastSearchedAt: Date | null }>(keywords: T[], slots: number): T[] {
  return [...keywords]
    .sort((a, b) => (a.lastSearchedAt?.getTime() ?? 0) - (b.lastSearchedAt?.getTime() ?? 0) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, slots));
}
