-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "shortcode" TEXT;

-- CreateIndex
CREATE INDEX "Lead_platform_shortcode_idx" ON "Lead"("platform", "shortcode");
