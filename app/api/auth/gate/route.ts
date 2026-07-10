import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, gateEnabled, deriveToken, timingSafeEqual } from "@/lib/access-gate";

export const dynamic = "force-dynamic";

// GET /api/auth/gate — is the access gate switched on? (drives the logout UI)
export async function GET() {
  return NextResponse.json({ enabled: gateEnabled() });
}

// POST /api/auth/gate  body: { password }
// Verifies the shared access password and, on success, sets the gate cookie.
export async function POST(req: NextRequest) {
  if (!gateEnabled()) {
    // Nothing to log into — the gate is off.
    return NextResponse.json({ ok: true, gate: "disabled" });
  }

  let password = "";
  try {
    ({ password = "" } = (await req.json()) as { password?: string });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const submitted = await deriveToken(password);
  const expected = await deriveToken(process.env.PIWEB_ACCESS_PASSWORD as string);
  if (!timingSafeEqual(submitted, expected)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

// DELETE /api/auth/gate — log out (clear the cookie).
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
