import { NextResponse } from "next/server";
import {
  ALL_SESSION_COOKIES,
  LEGACY_AUX_COOKIES,
} from "@/lib/auth-cookies";

export async function POST() {
  const response = NextResponse.json({ success: true });

  for (const cookieName of [...ALL_SESSION_COOKIES, ...LEGACY_AUX_COOKIES]) {
    response.cookies.set(cookieName, "", {
      path: "/",
      expires: new Date(0),
      httpOnly: cookieName.includes("session-token"),
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}
