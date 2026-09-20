import { NextRequest, NextResponse } from "next/server";
import { defaultLocale } from "./lib/i18n";

/**
 * Locale routing + production Content-Security-Policy.
 *
 * The CSP uses a per-request nonce; Next.js reads the nonce from the CSP header
 * we forward on the request and applies it to its own scripts. It is applied in
 * production only (dev HMR needs eval/ws, which a strict policy would block).
 */
function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
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
  // exclusion). It must not be locale-rewritten, but it does need the
  // nonce-based CSP for Next's inline flight scripts.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return finish(NextResponse.next({ request: { headers: forwardedHeaders } }));
  }

  if (pathname === "/ko" || pathname.startsWith("/ko/")) {
    const stripped = pathname.replace(/^\/ko/, "") || "/";
    return finish(NextResponse.redirect(new URL(stripped, req.url)));
  }
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    return finish(NextResponse.next({ request: { headers: forwardedHeaders } }));
  }
  return finish(
    NextResponse.rewrite(new URL("/ko" + (pathname === "/" ? "" : pathname), req.url), {
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
