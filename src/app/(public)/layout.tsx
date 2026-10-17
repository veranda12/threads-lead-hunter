import Link from "next/link";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <span className="text-[15px] font-semibold text-ink">Threads Lead Hunter</span>
          <nav aria-label="Tautan publik" className="flex gap-4 text-sm">
            <Link href="/privacy-policy" className="text-ink-2 hover:text-ink">
              Privacy
            </Link>
            <Link href="/data-deletion" className="text-ink-2 hover:text-ink">
              Hapus data
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
