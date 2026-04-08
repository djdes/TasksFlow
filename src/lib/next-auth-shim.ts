import realDefault, * as real from "../../node_modules/next-auth";
import type {
  NextAuthOptions as RealNextAuthOptions,
  Session as RealSession,
} from "../../node_modules/next-auth";
import { decode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { CUSTOM_SESSION_COOKIE, LEGACY_SESSION_COOKIES } from "@/lib/auth-cookies";

export * from "../../node_modules/next-auth";
export default realDefault;

export async function getServerSession(
  ...args: unknown[]
): Promise<RealSession | null> {
  const options = args[args.length - 1] as RealNextAuthOptions | undefined;
  const cookieStore = await cookies();
  const rawToken =
    cookieStore.get(CUSTOM_SESSION_COOKIE)?.value ??
    LEGACY_SESSION_COOKIES.map((name) => cookieStore.get(name)?.value).find(Boolean);

  if (!rawToken) {
    return null;
  }

  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    return null;
  }

  const token = await decode({
    token: rawToken,
    secret,
  });

  if (!token) {
    return null;
  }

  const session: RealSession = {
    user: {
      id: typeof token.id === "string" ? token.id : String(token.sub ?? ""),
      role: typeof token.role === "string" ? token.role : "",
      organizationId:
        typeof token.organizationId === "string" ? token.organizationId : "",
      organizationName:
        typeof token.organizationName === "string"
          ? token.organizationName
          : "",
      name: typeof token.name === "string" ? token.name : null,
      email: typeof token.email === "string" ? token.email : null,
      image: null,
    },
    expires:
      typeof token.exp === "number"
        ? new Date(token.exp * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  if (options?.callbacks?.session) {
    return (options.callbacks.session as (...args: unknown[]) => unknown)({
      session,
      token,
    }) as Promise<RealSession> | RealSession;
  }

  return session;
}

export const unstable_getServerSession = getServerSession;
