import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSetting } from "@/lib/settings";
import { env } from "@/lib/env";
import { privacyConfigGaps } from "@/lib/privacy";
import { policySections, type Lang } from "./policy-content";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Kebijakan privasi Threads Lead Hunter / Privacy policy of Threads Lead Hunter.",
  robots: { index: true, follow: true },
  alternates: { languages: { id: "/privacy-policy", en: "/privacy-policy?lang=en" } },
};

async function Policy({ searchParams }: { searchParams: PageProps<"/privacy-policy">["searchParams"] }) {
  const sp = await searchParams;
  const lang: Lang = sp.lang === "en" ? "en" : "id";
  const [privacy, ai] = await Promise.all([getSetting("privacy"), getSetting("ai")]);
  const gaps = privacyConfigGaps(privacy);
  const sections = policySections(lang, { ...privacy, appUrl: env.appUrl, https: env.appUrl.startsWith("https://"), aiProvider: ai.provider });

  return (
    <article lang={lang} className="policy">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{lang === "id" ? "Bahasa" : "Language"}</p>
        <div className="flex rounded-md border border-line-strong bg-surface p-0.5 text-sm" role="group" aria-label="Pilih bahasa / Choose language">
          <Link href="/privacy-policy" hrefLang="id" aria-current={lang === "id" ? "page" : undefined} className={`rounded px-3 py-1 ${lang === "id" ? "bg-sunken font-medium" : "text-muted"}`}>
            Indonesia
          </Link>
          <Link href="/privacy-policy?lang=en" hrefLang="en" aria-current={lang === "en" ? "page" : undefined} className={`rounded px-3 py-1 ${lang === "en" ? "bg-sunken font-medium" : "text-muted"}`}>
            English
          </Link>
        </div>
      </div>

      <h1 className="text-3xl font-semibold text-ink">{lang === "id" ? "Kebijakan Privasi" : "Privacy Policy"}</h1>
      <p className="mt-2 text-sm text-muted">
        {lang === "id" ? "Berlaku sejak" : "Effective"}: {privacy.effectiveDate || (lang === "id" ? "belum ditetapkan" : "not yet set")}
      </p>

      {gaps.length ? (
        <div role="note" className="mt-6 rounded-md border border-ochre/30 bg-ochre-soft px-4 py-3 text-sm text-ink-2">
          {lang === "id"
            ? "Beberapa isian kebijakan ini belum ditetapkan oleh pengelola dan ditandai di bawah. Kebijakan tetap menggambarkan cara kerja aplikasi saat ini."
            : "Some details of this policy have not been set by the operator yet and are marked below. The policy still describes how the application currently works."}
        </div>
      ) : null}

      <nav aria-label={lang === "id" ? "Daftar isi" : "Contents"} className="mt-8 border-y border-line py-4">
        <ol className="grid gap-1 text-sm sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-ink-2 hover:text-ink">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 space-y-9">
        {sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-6">
            <h2 id={`${s.id}-h`} className="text-lg font-semibold text-ink">
              {s.title}
            </h2>
            <div className="mt-3 space-y-3 text-[15px] leading-7 text-ink-2 [&_code]:rounded-sm [&_code]:bg-sunken [&_code]:px-1 [&_code]:text-[13px] [&_li]:mt-1.5 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
              {s.body}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

export default function PrivacyPolicyPage({ searchParams }: PageProps<"/privacy-policy">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Memuat kebijakan privasi / Loading privacy policy...</p>}>
      <Policy searchParams={searchParams} />
    </Suspense>
  );
}
