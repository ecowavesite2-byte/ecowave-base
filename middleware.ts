import { NextRequest, NextResponse } from "next/server";
import { defaultLocale } from "./lib/i18n";

/**
 * Locale routing + production Content-Security-Policy.
 *
 * Applied in production only (dev HMR needs eval/ws, which a strict policy
 * would block). script-src currently allows 'unsafe-inline' instead of a
 * nonce + 'strict-dynamic': Next's emitted scripts do not carry the nonce, so
 * the strict policy blocked all client JS (reveal/scroll animations) on the
 * public pages. A strict nonce policy can be reintroduced later once the nonce
 * is actually applied to Next's scripts (or scoped to /admin only).
 */
function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    // 'self' is required for the admin preview iframe; the rest cover the
    // crawled YouTube / Google Maps embeds.
    "frame-src 'self' https://www.youtube.com https://www.google.com https://maps.google.com",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProd = process.env.NODE_ENV === "production";
  const nonce = isProd ? crypto.randomUUID().replace(/-/g, "") : "";
  const csp = isProd ? contentSecurityPolicy(nonce) : "";

  const forwardedHeaders = new Headers(req.headers);
  if (isProd) {
    forwardedHeaders.set("x-nonce", nonce);
    forwardedHeaders.set("Content-Security-Policy", csp);
  }

  const finish = (response: NextResponse) => {
    if (isProd) response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  // /admin is matched explicitly (dotted keys such as
  // /admin/pages/company.ceo are skipped by the main matcher's `.*\..*`
  // exclusion). It must not be locale-rewritten, but it does need the CSP
  // header (currently 'unsafe-inline' based, since Next's scripts carry no nonce).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return finish(NextResponse.next({ request: { headers: forwardedHeaders } }));
  }

  if (pathname === "/ko" || pathname.startsWith("/ko/")) {
    const stripped = pathname.replace(/^\/ko/, "") || "/";
    // clone so the query string (?cat= / ?page=…) survives the redirect
    const target = req.nextUrl.clone();
    target.pathname = stripped;
    return finish(NextResponse.redirect(target));
  }
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    return finish(NextResponse.next({ request: { headers: forwardedHeaders } }));
  }
  // clone so the query string survives the locale rewrite — a bare
  // `new URL("/ko" + pathname, req.url)` drops `?cat=`/`?page=` and the board
  // pages then render unfiltered/unpaginated (filtering + page 2 were dead).
  const target = req.nextUrl.clone();
  target.pathname = "/ko" + (pathname === "/" ? "" : pathname);
  return finish(
    NextResponse.rewrite(target, {
      request: { headers: forwardedHeaders },
    }),
  );
}

export const config = {
  matcher: [
    "/((?!_next/|images/|uploads/|media/|admin|api/|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)",
    // explicit admin matcher so nested/dotted admin routes also get the CSP
    "/admin/:path*",
  ],
};

// keep defaultLocale referenced for clarity of intent
void defaultLocale;
