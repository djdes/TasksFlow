import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  CUSTOM_SESSION_COOKIE,
  LEGACY_SESSION_COOKIES,
} from "@/lib/auth-cookies";

function buildCookieHeader(request: NextRequest) {
  const current = request.cookies.getAll();
  const sessionToken = request.cookies.get(CUSTOM_SESSION_COOKIE)?.value;
  const filtered = current.filter(
    (cookie) =>
      cookie.name !== CUSTOM_SESSION_COOKIE &&
      !LEGACY_SESSION_COOKIES.includes(cookie.name)
  );

  if (sessionToken) {
    filtered.push(
      { name: "__Secure-next-auth.session-token", value: sessionToken },
      { name: "next-auth.session-token", value: sessionToken }
    );
  }

  return filtered.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("cookie", buildCookieHeader(request));

  return NextResponse.next({
    request: {
      headers,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json).*)"],
};
