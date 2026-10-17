import { z } from "zod";

export const INTENTS = [
  "SERVICE_REQUEST",
  "VENDOR_RECOMMENDATION",
  "PRICE_INQUIRY",
  "PARTNER_SEARCH",
  "JOB_VACANCY",
  "SELF_PROMOTION",
  "PROMOTION",
  "GENERAL_DISCUSSION",
  "SPAM",
  "IRRELEVANT",
] as const;

export const LEAD_CATEGORIES = ["WEBSITE", "ENTERPRISE_SOFTWARE", "TECHNICAL_SERVICE", "OTHER"] as const;

export const CATEGORY_LABELS: Record<(typeof LEAD_CATEGORIES)[number], string> = {
  WEBSITE: "Website",
  ENTERPRISE_SOFTWARE: "Software enterprise",
  TECHNICAL_SERVICE: "Layanan teknis",
  OTHER: "Lainnya",
};

/** Output mentah dari Claude. Batas numerik juga ditegakkan ulang oleh applyAnalysisGuards. */
export const analysisOutputSchema = z.object({
  intent: z.enum(INTENTS),
  category: z.enum(LEAD_CATEGORIES),
  isServiceRequest: z.boolean(),
  confidence: z.number(),
  leadScore: z.number(),
  urgency: z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]),
  projectComplexity: z.enum(["SIMPLE", "MODERATE", "COMPLEX", "UNKNOWN"]),
  budgetType: z.enum(["STATED_BY_AUTHOR", "NOT_MENTIONED"]),
  possibleBudget: z.string().nullable(),
  budgetEvidence: z.string().nullable(),
  estimatedService: z.string().nullable(),
  qualificationReason: z.string(),
  recommendedApproach: z.string(),
  redFlags: z.array(z.string()),
  nextQuestion: z.string().nullable(),
  promptInjectionDetected: z.boolean(),
});

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

export const DRAFT_TONES = ["FRIENDLY", "PROFESSIONAL", "CONSULTATIVE"] as const;
export type DraftToneId = (typeof DRAFT_TONES)[number];

export const TONE_LABELS: Record<DraftToneId, string> = {
  FRIENDLY: "Santai",
  PROFESSIONAL: "Profesional",
  CONSULTATIVE: "Konsultatif",
};

export const draftsOutputSchema = z.object({
  drafts: z.array(
    z.object({
      tone: z.enum(DRAFT_TONES),
      body: z.string(),
    }),
  ),
});

export type DraftsOutput = z.infer<typeof draftsOutputSchema>;

/**
 * Satu panggilan: klasifikasi + skor + draft DM. `drafts` kosong bila postingan bukan
 * permintaan jasa atau skornya di bawah ambang draft.
 */
export const combinedOutputSchema = analysisOutputSchema.extend({
  drafts: draftsOutputSchema.shape.drafts,
});
export type CombinedOutput = z.infer<typeof combinedOutputSchema>;

/** Classifier awal yang murah (model kecil, muat penuh di GPU). */
export const triageOutputSchema = z.object({
  intent: z.enum(INTENTS),
  isServiceRequest: z.boolean(),
  relevance: z.number(),
  confidence: z.number(),
  reason: z.string(),
});
export type TriageOutput = z.infer<typeof triageOutputSchema>;
