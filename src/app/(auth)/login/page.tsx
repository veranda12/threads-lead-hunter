import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

async function LoginGate({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const user = await readSession();
  if (user) redirect("/");
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return <LoginForm next={next} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="text-[15px] font-semibold text-ink">Threads Lead Hunter</p>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Masuk ke dashboard</h1>
        <p className="mt-1 text-sm text-muted">Dashboard internal, satu akun pengelola.</p>
        <div className="panel mt-6 p-5">
          <Suspense fallback={<div className="h-48" />}>
            <LoginGate searchParams={searchParams} />
          </Suspense>
        </div>
        <p className="mt-6 text-xs text-muted">
          <Link href="/privacy-policy" className="link">
            Kebijakan privasi
          </Link>
          <span aria-hidden> · </span>
          <Link href="/data-deletion" className="link">
            Permintaan penghapusan data
          </Link>
        </p>
      </div>
    </main>
  );
}
