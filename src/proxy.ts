import { NextResponse, type NextRequest } from "next/server";

// Optimistic check saja: hanya melihat keberadaan cookie sesi. Validasi sesi yang sebenarnya
// dilakukan di server (src/lib/auth/dal.ts) pada setiap halaman, Server Action, dan Route Handler.

const PUBLIC_PATHS = ["/login", "/privacy-policy", "/data-deletion"];
const PUBLIC_API_PREFIXES = ["/api/internal/", "/api/threads/data-deletion", "/api/threads/uninstall", "/api/health"];

function hasSessionCookie(req: NextRequest) {
  return Boolean(req.cookies.get("__Host-tlh_session")?.value || req.cookies.get("tlh_session")?.value);
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (!hasSessionCookie(req)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
