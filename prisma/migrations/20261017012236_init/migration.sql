-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'REVIEWED', 'CONTACTED', 'REPLIED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Freshness" AS ENUM ('FRESH', 'EXPIRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('OFFICIAL_THREADS', 'MANUAL_IMPORT', 'DEMO_FIXTURE');

-- CreateEnum
CREATE TYPE "LeadIntent" AS ENUM ('SERVICE_REQUEST', 'VENDOR_RECOMMENDATION', 'PRICE_INQUIRY', 'PARTNER_SEARCH', 'JOB_VACANCY', 'SELF_PROMOTION', 'PROMOTION', 'GENERAL_DISCUSSION', 'SPAM', 'IRRELEVANT');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'IGNORE');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'PREFILTERED_OUT', 'ANALYZED', 'FAILED', 'BUDGET_EXCEEDED', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('OFFICIAL_THREADS', 'MANUAL');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'PERMISSION_REQUIRED', 'TOKEN_EXPIRED', 'RATE_LIMITED', 'PROVIDER_ERROR', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED_LOCKED', 'SKIPPED_DISABLED');

-- CreateEnum
CREATE TYPE "RunTrigger" AS ENUM ('SCHEDULER', 'MANUAL', 'WORKER');

-- CreateEnum
CREATE TYPE "RunItemOutcome" AS ENUM ('NEW_LEAD', 'UPDATED_CONTENT', 'DUPLICATE', 'STALE', 'INVALID_TIMESTAMP', 'FUTURE_TIMESTAMP', 'SUPPRESSED', 'ERROR');

-- CreateEnum
CREATE TYPE "KeywordCategory" AS ENUM ('WEBSITE', 'ENTERPRISE_SOFTWARE', 'GENERAL', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "DraftTone" AS ENUM ('FRIENDLY', 'PROFESSIONAL', 'CONSULTATIVE');

-- CreateEnum
CREATE TYPE "DraftSource" AS ENUM ('AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('FIXED', 'STARTING_FROM', 'MONTHLY', 'CUSTOM_QUOTE');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('DISCOVERED', 'IMPORTED', 'ANALYZED', 'STATUS_CHANGED', 'NOTE_ADDED', 'DRAFT_GENERATED', 'DRAFT_EDITED', 'DRAFT_FAVORITED', 'CONTACTED', 'FOLLOW_UP_SET', 'CONTENT_UPDATED');

-- CreateEnum
CREATE TYPE "UsageProvider" AS ENUM ('THREADS', 'ANTHROPIC');

-- CreateEnum
CREATE TYPE "DeletionRequestSource" AS ENUM ('META_CALLBACK', 'WEB_FORM');

-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('RECEIVED', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IntegrationAccount" (
    "id" TEXT NOT NULL,
    "provider" "ProviderKind" NOT NULL,
    "externalUserId" TEXT,
    "username" TEXT,
    "accessTokenEnc" TEXT,
    "tokenIssuedAt" TIMESTAMPTZ(3),
    "tokenExpiresAt" TIMESTAMPTZ(3),
    "scopes" TEXT[],
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "statusMessage" TEXT,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "lastRefreshedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IntegrationAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchProvider" (
    "id" TEXT NOT NULL,
    "kind" "ProviderKind" NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "statusMessage" TEXT,
    "dailyRequestBudget" INTEGER NOT NULL DEFAULT 1500,
    "rateLimitedUntil" TIMESTAMPTZ(3),
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastErrorAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SearchProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchKeyword" (
    "id" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "category" "KeywordCategory" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSearchedAt" TIMESTAMPTZ(3),
    "searchCount" INTEGER NOT NULL DEFAULT 0,
    "totalResults" INTEGER NOT NULL DEFAULT 0,
    "leadsFound" INTEGER NOT NULL DEFAULT 0,
    "qualifiedLeads" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SearchKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "trigger" "RunTrigger" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "serverNow" TIMESTAMPTZ(3) NOT NULL,
    "cutoffAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "keywordsSearched" INTEGER NOT NULL DEFAULT 0,
    "apiRequests" INTEGER NOT NULL DEFAULT 0,
    "postsFetched" INTEGER NOT NULL DEFAULT 0,
    "postsNew" INTEGER NOT NULL DEFAULT 0,
    "postsUpdated" INTEGER NOT NULL DEFAULT 0,
    "postsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "postsStale" INTEGER NOT NULL DEFAULT 0,
    "postsInvalid" INTEGER NOT NULL DEFAULT 0,
    "prefilterRejected" INTEGER NOT NULL DEFAULT 0,
    "analyzed" INTEGER NOT NULL DEFAULT 0,
    "analysisPending" INTEGER NOT NULL DEFAULT 0,
    "draftsGenerated" INTEGER NOT NULL DEFAULT 0,
    "aiInputTokens" INTEGER NOT NULL DEFAULT 0,
    "aiOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "log" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "DiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryRunItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "keywordId" TEXT,
    "platform" TEXT NOT NULL,
    "platformPostId" TEXT NOT NULL,
    "outcome" "RunItemOutcome" NOT NULL,
    "reason" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'threads',
    "platformPostId" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL,
    "permalink" TEXT,
    "authorUsername" TEXT,
    "text" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "mediaType" TEXT,
    "postedAt" TIMESTAMPTZ(3),
    "discoveredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawData" JSONB,
    "rawPurgedAt" TIMESTAMPTZ(3),
    "matchedKeywordId" TEXT,
    "freshness" "Freshness" NOT NULL DEFAULT 'UNKNOWN',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "prefilterScore" INTEGER NOT NULL DEFAULT 0,
    "prefilterReason" TEXT,
    "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "analysisError" TEXT,
    "intent" "LeadIntent",
    "category" TEXT,
    "leadScore" INTEGER,
    "priority" "LeadPriority",
    "estimatedService" TEXT,
    "nextFollowUpAt" TIMESTAMPTZ(3),
    "contactedAt" TIMESTAMPTZ(3),
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAnalysis" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "intent" "LeadIntent" NOT NULL,
    "category" TEXT NOT NULL,
    "isServiceRequest" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "leadScore" INTEGER NOT NULL,
    "priority" "LeadPriority" NOT NULL,
    "urgency" TEXT NOT NULL,
    "projectComplexity" TEXT NOT NULL,
    "budgetType" TEXT NOT NULL,
    "possibleBudget" TEXT,
    "budgetEvidence" TEXT,
    "estimatedService" TEXT,
    "qualificationReason" TEXT NOT NULL,
    "recommendedApproach" TEXT NOT NULL,
    "redFlags" TEXT[],
    "nextQuestion" TEXT,
    "guardNotes" TEXT[],
    "raw" JSONB NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "fromStatus" "LeadStatus",
    "toStatus" "LeadStatus",
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadNote" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDraft" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tone" "DraftTone" NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MessageDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDraftRevision" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "source" "DraftSource" NOT NULL,
    "modelVersion" TEXT,
    "issues" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageDraftRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingPlan" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricingType" "PricingType" NOT NULL,
    "priceMin" INTEGER,
    "priceMax" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLock" (
    "name" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "ApiUsageLog" (
    "id" TEXT NOT NULL,
    "provider" "UsageProvider" NOT NULL,
    "operation" TEXT NOT NULL,
    "runId" TEXT,
    "leadId" TEXT,
    "model" TEXT,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "quotaUnits" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressedAuthor" (
    "usernameHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressedAuthor_pkey" PRIMARY KEY ("usernameHash")
);

-- CreateTable
CREATE TABLE "DataDeletionRequest" (
    "id" TEXT NOT NULL,
    "confirmationCode" TEXT NOT NULL,
    "source" "DeletionRequestSource" NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "platformUserId" TEXT,
    "threadsUsername" TEXT,
    "contactEmail" TEXT,
    "details" TEXT,
    "resolution" TEXT,
    "deletedLeads" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationAccount_provider_key" ON "IntegrationAccount"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "SearchProvider_kind_key" ON "SearchProvider"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "SearchKeyword_phrase_key" ON "SearchKeyword"("phrase");

-- CreateIndex
CREATE INDEX "SearchKeyword_enabled_lastSearchedAt_idx" ON "SearchKeyword"("enabled", "lastSearchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryRun_executionId_key" ON "DiscoveryRun"("executionId");

-- CreateIndex
CREATE INDEX "DiscoveryRun_startedAt_idx" ON "DiscoveryRun"("startedAt");

-- CreateIndex
CREATE INDEX "DiscoveryRun_status_startedAt_idx" ON "DiscoveryRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "DiscoveryRunItem_runId_idx" ON "DiscoveryRunItem"("runId");

-- CreateIndex
CREATE INDEX "DiscoveryRunItem_leadId_idx" ON "DiscoveryRunItem"("leadId");

-- CreateIndex
CREATE INDEX "Lead_postedAt_idx" ON "Lead"("postedAt");

-- CreateIndex
CREATE INDEX "Lead_status_lastActivityAt_idx" ON "Lead"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "Lead_analysisStatus_idx" ON "Lead"("analysisStatus");

-- CreateIndex
CREATE INDEX "Lead_leadScore_idx" ON "Lead"("leadScore");

-- CreateIndex
CREATE INDEX "Lead_discoveredAt_idx" ON "Lead"("discoveredAt");

-- CreateIndex
CREATE INDEX "Lead_authorUsername_idx" ON "Lead"("authorUsername");

-- CreateIndex
CREATE INDEX "Lead_nextFollowUpAt_idx" ON "Lead"("nextFollowUpAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_platform_platformPostId_key" ON "Lead"("platform", "platformPostId");

-- CreateIndex
CREATE INDEX "LeadAnalysis_leadId_isCurrent_idx" ON "LeadAnalysis"("leadId", "isCurrent");

-- CreateIndex
CREATE INDEX "LeadAnalysis_contentHash_promptVersion_idx" ON "LeadAnalysis"("contentHash", "promptVersion");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadActivity_createdAt_idx" ON "LeadActivity"("createdAt");

-- CreateIndex
CREATE INDEX "LeadNote_leadId_createdAt_idx" ON "LeadNote"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDraft_leadId_tone_key" ON "MessageDraft"("leadId", "tone");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDraftRevision_draftId_revision_key" ON "MessageDraftRevision"("draftId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

-- CreateIndex
CREATE INDEX "PricingPlan_serviceId_active_idx" ON "PricingPlan"("serviceId", "active");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ApiUsageLog_provider_createdAt_idx" ON "ApiUsageLog"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "ApiUsageLog_runId_idx" ON "ApiUsageLog"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "DataDeletionRequest_confirmationCode_key" ON "DataDeletionRequest"("confirmationCode");

-- CreateIndex
CREATE INDEX "DataDeletionRequest_status_createdAt_idx" ON "DataDeletionRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryRunItem" ADD CONSTRAINT "DiscoveryRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DiscoveryRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryRunItem" ADD CONSTRAINT "DiscoveryRunItem_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "SearchKeyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryRunItem" ADD CONSTRAINT "DiscoveryRunItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_matchedKeywordId_fkey" FOREIGN KEY ("matchedKeywordId") REFERENCES "SearchKeyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAnalysis" ADD CONSTRAINT "LeadAnalysis_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDraft" ADD CONSTRAINT "MessageDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDraftRevision" ADD CONSTRAINT "MessageDraftRevision_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "MessageDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingPlan" ADD CONSTRAINT "PricingPlan_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
