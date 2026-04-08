import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll().map((cookie) => cookie.name);
  const session = await getServerSession(authOptions);

  return NextResponse.json({
    cookies: allCookies,
    session: session
      ? {
          email: session.user.email,
          role: session.user.role,
          organizationId: session.user.organizationId,
        }
      : null,
  });
}
