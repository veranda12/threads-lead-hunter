import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { getAiStatus } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import postingan" };

export default async function ImportPage() {
  await requireUser();
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Import postingan manual"
        description="Tempel URL postingan Threads yang Anda temukan sendiri, beserta teksnya. Aplikasi tidak melakukan scraping; data yang diisi di sini ditandai sebagai import manual."
      />
      <ImportForm aiConfigured={(await getAiStatus()).runtime.available} />
    </div>
  );
}
