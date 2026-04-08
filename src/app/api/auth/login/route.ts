import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";
import { db } from "@/lib/db";
import {
  ALL_SESSION_COOKIES,
  CUSTOM_SESSION_COOKIE,
  LEGACY_AUX_COOKIES,
} from "@/lib/auth-cookies";

const MAX_AGE = 365 * 24 * 60 * 60;

function clearLegacyCookies(response: NextResponse) {
  for (const cookieName of [...ALL_SESSION_COOKIES, ...LEGACY_AUX_COOKIES]) {
    if (cookieName === CUSTOM_SESSION_COOKIE) {
      continue;
    }
    response.cookies.set(cookieName, "", {
      path: "/",
      expires: new Date(0),
      httpOnly: cookieName.includes("session-token"),
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Введите email и пароль" },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "Неверный email или пароль" },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Неверный email или пароль" },
        { status: 401 }
      );
    }

    const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
    if (!secret) {
      throw new Error("NEXTAUTH_SECRET is not configured");
    }

    const token = await encode({
      secret,
      maxAge: MAX_AGE,
      token: {
        sub: user.id,
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
      },
    });

    const response = NextResponse.json({ success: true });
    clearLegacyCookies(response);
    response.cookies.set(CUSTOM_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    console.error("Custom login error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
