import { NextResponse, type NextRequest } from "next/server";
import { decode } from "next-auth/jwt";
import {
  CUSTOM_SESSION_COOKIE,
  LEGACY_SESSION_COOKIES,
} from "@/lib/auth-cookies";

/**
 * Global middleware.
 *
 * 1. `/root/*` is the platform superadmin area. Non-root requests get a plain
 *    404 so customer users can't even probe for the URL's existence (we
 *    intentionally don't redirect — a 302 back to /dashboard would reveal the
 *    route exists). Anonymous requests also 404: if there's no session, they
 *    aren't root either, and we still don't want to leak.
 *
 * 2. `/api/root/*` is the matching API surface; same 404 policy.
 *
 * We decode the JWT manually (not via getToken) so we can read the custom
 * cookie this project installed on top of NextAuth.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/root") && !pathname.startsWith("/api/root")) {
    return NextResponse.next();
  }

  const rawToken =
    req.cookies.get(CUSTOM_SESSION_COOKIE)?.value ??
    LEGACY_SESSION_COOKIES.map((name) => req.cookies.get(name)?.value).find(
      Boolean
    );

  if (!rawToken) {
    return NextResponse.rewrite(new URL("/404", req.url), { status: 404 });
  }

  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.rewrite(new URL("/404", req.url), { status: 404 });
  }

  const token = await decode({ token: rawToken, secret }).catch(() => null);
  if (!token || token.isRoot !== true) {
    return NextResponse.rewrite(new URL("/404", req.url), { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  // Next.js 16 path-to-regexp misses the bare `/root` and `/api/root/<handler>`
  // segments no matter how we list them (`/root`, `/root/:path*`, `/root{/:path*}`
  // all leak anon probes to the page layer, which then 307s to /login and
  // leaks the section's existence). Catch every request that isn't a Next.js
  // internal asset instead, and let the early `startsWith` check above exit
  // in a single string-compare for the 99.9% of traffic that isn't `/root`.
  matcher: ["/((?!_next/|favicon\\.ico$).*)"],
};
