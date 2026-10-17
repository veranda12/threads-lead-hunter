import { Suspense } from "react";
import Link from "next/link";
import { MobileNav, SideNav, SideNavFallback } from "@/components/client/app-nav";
import { Skeleton } from "@/components/ui";
import { readSession } from "@/lib/auth/session";
import { logoutAction } from "@/app/(auth)/login/actions";

async function AccountMenu() {
  const user = await readSession();
  if (!user) return null;
  return (
    <form action={logoutAction} className="flex items-center gap-3 text-sm">
      <span className="hidden max-w-[14rem] truncate text-muted sm:inline" title={user.email}>
        {user.name}
      </span>
      <button type="submit" className="btn btn-ghost btn-sm">
        Keluar
      </button>
    </form>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh">
      <a href="#konten" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Lewati ke konten
      </a>
      <header className="relative border-b border-line bg-canvas">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Suspense fallback={null}>
              <MobileNav />
            </Suspense>
            <Link href="/" className="text-[15px] font-semibold tracking-tight text-ink">
              Threads Lead Hunter
            </Link>
          </div>
          <Suspense fallback={<span className="h-6 w-24" />}>
            <AccountMenu />
          </Suspense>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Suspense fallback={<SideNavFallback />}>
            <SideNav />
          </Suspense>
        </aside>
        <main id="konten" className="min-w-0">
          <Suspense fallback={<Skeleton />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
