import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, gateEnabled, cookieAuthorizes } from "@/lib/access-gate";

// Access gate. When PIWEB_ACCESS_PASSWORD is unset this is a no-op (local use
// is unchanged). When set, every request must carry a valid gate cookie —
// unauthenticated page loads redirect to /login, API calls get a 401.
//
// The matcher already excludes Next internals and static assets so the login
// page can load its CSS before the user is authenticated; we still let the
// login page and the gate endpoint through explicitly below.
export async function middleware(req: NextRequest) {
  if (!gateEnabled()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isLoginPage = pathname === "/login";
  const isGateApi = pathname === "/api/auth/gate";
  const isIcon = pathname === "/icon.svg" || pathname === "/favicon.ico";
  if (isLoginPage || isGateApi || isIcon) return NextResponse.next();

  if (await cookieAuthorizes(req.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  // Preserve where they were headed so login can bounce them back.
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and obvious static files.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf)$).*)"],
};
