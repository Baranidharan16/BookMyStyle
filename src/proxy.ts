import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate: bounce visitors without a session cookie to sign-in
 * before rendering protected areas. Real authorisation (role + tenant)
 * happens server-side in every page and API handler.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.get("bms_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export const config = {
  matcher: ["/customer/:path*", "/business/:path*", "/staff/:path*", "/admin/:path*", "/checkout/:path*", "/notifications", "/pay/:path*"],
};
