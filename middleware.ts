import { NextRequest, NextResponse } from "next/server";
import { defaultLocale } from "./lib/i18n";

/**
 * Locale routing: Korean is the default with no URL prefix; English lives
 * under /en/... (/ko/... redirects to the prefix-free form).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/ko" || pathname.startsWith("/ko/")) {
    const stripped = pathname.replace(/^\/ko/, "") || "/";
    return NextResponse.redirect(new URL(stripped, req.url));
  }
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    return NextResponse.next();
  }
  return NextResponse.rewrite(new URL("/ko" + (pathname === "/" ? "" : pathname), req.url));
}

export const config = {
  matcher: ["/((?!_next|images|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"],
};

// keep defaultLocale referenced for clarity of intent
void defaultLocale;
