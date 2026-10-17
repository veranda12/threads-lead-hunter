import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSetting } from "@/lib/settings";
import { DeletionForm } from "./deletion-form";

export const metadata: Metadata = {
  title: "Permintaan penghapusan data",
  robots: { index: true, follow: true },
};

async function Contact() {
  const privacy = await getSetting("privacy");
  return (
    <p className="mt-6 text-sm text-muted">
      {privacy.contactEmail ? (
        <>
          Atau kirim email ke / Or email{" "}
          <a href={`mailto:${privacy.contactEmail}`} className="link">
            {privacy.contactEmail}
          </a>
          .{" "}
        </>
      ) : null}
      {privacy.deletionResponseDays
        ? `Permintaan diproses paling lambat ${privacy.deletionResponseDays} hari / Requests are processed within ${privacy.deletionResponseDays} days.`
        : null}
    </p>
  );
}

export default function DataDeletionPage() {
  return (
    <div>
      <h1 className="text-3xl font-semibold text-ink">Permintaan penghapusan data</h1>
      <p className="mt-1 text-lg text-muted">Data deletion request</p>
      <div className="mt-6 space-y-3 text-[15px] leading-7 text-ink-2">
        <p>
          Jika postingan Threads Anda tersimpan di alat ini, isi username Threads Anda. Username langsung masuk daftar pengecualian, lalu pengelola menghapus seluruh postingan,
          analisis, catatan, dan draft pesan yang terkait. Lihat{" "}
          <Link href="/privacy-policy#hak" className="link">
            Kebijakan Privasi
          </Link>
          .
        </p>
        <p lang="en">
          If your Threads post is stored in this tool, enter your Threads username. It is excluded from collection right away, and the operator deletes every stored post, analysis,
          note, and message draft linked to it. See the{" "}
          <Link href="/privacy-policy?lang=en#rights" className="link">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
      <div className="mt-8">
        <DeletionForm />
      </div>
      <Suspense fallback={null}>
        <Contact />
      </Suspense>
      <p className="mt-6 text-sm text-muted">
        Sudah punya kode? / Have a code?{" "}
        <Link href="/data-deletion/status" className="link">
          Cek status / Check status
        </Link>
      </p>
    </div>
  );
}
