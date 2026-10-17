"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const NAV = [
  { href: "/", label: "Ringkasan" },
  { href: "/leads", label: "Lead" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/keywords", label: "Keyword" },
  { href: "/pricing", label: "Harga layanan" },
  { href: "/automation", label: "Otomasi" },
  { href: "/analytics", label: "Analitik" },
  { href: "/privacy-requests", label: "Permintaan privasi" },
  { href: "/settings", label: "Pengaturan" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <NavItems pathname={pathname} onNavigate={onNavigate} />;
}

/** Daftar nav tanpa hook, dipakai juga sebagai fallback Suspense. */
export function NavItems({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {NAV.map((item) => {
        const active = pathname !== null && isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                active ? "bg-surface font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)]" : "text-ink-2 hover:bg-sunken hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SideNavFallback() {
  return (
    <nav aria-label="Navigasi utama" className="hidden lg:block">
      <NavItems pathname={null} />
    </nav>
  );
}

export function SideNav() {
  return (
    <nav aria-label="Navigasi utama" className="hidden lg:block">
      <NavLinks />
    </nav>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)}>
        {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
        <span>Menu</span>
      </button>
      {open ? (
        <nav id="mobile-nav" aria-label="Navigasi utama" className="absolute inset-x-0 top-full z-30 border-b border-line bg-canvas px-4 pb-4 pt-2 shadow-[0_8px_24px_-12px_rgba(26,25,21,0.25)]">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      ) : null}
    </div>
  );
}
