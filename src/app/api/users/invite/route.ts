import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendInviteTokenEmail } from "@/lib/email";
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
} from "@/lib/invite-tokens";
import {
  isManagerRole,
  toCanonicalUserRole,
  USER_ROLE_VALUES,
} from "@/lib/user-roles";
import { getActiveOrgId } from "@/lib/auth-helpers";

const inviteUserSchema = z.object({
  name: z.string().min(2, "Имя должно содержать минимум 2 символа"),
  email: z.string().email("Введите корректный email"),
  role: z.enum(USER_ROLE_VALUES, { message: "Выберите роль" }),
  phone: z.string().optional(),
});

/**
 * POST /api/users/invite
 *
 * Creates a placeholder User (isActive=false, empty passwordHash) plus a
 * one-shot InviteToken. Emails a /invite/<raw> URL to the new employee —
 * no raw password is ever persisted or transmitted. The employee clicks
 * the link, sets their password via POST /api/invite/[token]/accept, and
 * the user is activated.
 *
 * Breaking change vs the old flow: the `password` field is no longer
 * accepted. Callers must migrate to the invite-link flow.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }
    if (!isManagerRole(session.user.role) && !session.user.isRoot) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const body = await request.json();
    const data = inviteUserSchema.parse(body);

    const existingUser = await db.user.findUnique({ where: { email: data.email } });
    if (existingUser) {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует" },
        { status: 409 }
      );
    }

    const raw = generateInviteToken();
    const tokenHash = hashInviteToken(raw);
    const expiresAt = inviteExpiresAt();
    const organizationId = getActiveOrgId(session);

    const { user } = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash: "",
          role: toCanonicalUserRole(data.role),
          phone: data.phone || null,
          organizationId,
          isActive: false,
        },
      });
      await tx.inviteToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
      return { user };
    });

    const inviteUrl = buildInviteUrl(raw);
    sendInviteTokenEmail({
      to: user.email,
      name: user.name,
      organizationName: session.user.organizationName,
      inviteUrl,
    }).catch((err) => console.error("sendInviteTokenEmail failed", err));

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Некорректные данные", details: error },
        { status: 400 }
      );
    }
    console.error("User invite error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
