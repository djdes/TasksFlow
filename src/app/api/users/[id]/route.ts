import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServerSession } from "@/lib/server-session";
import {
  isLegacyUserRoleValue,
  isManagerRole,
  isUserRoleValue,
  normalizeUserRole,
  toCanonicalUserRole,
} from "@/lib/user-roles";

const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  role: z
    .string()
    .trim()
    .refine((value) => isUserRoleValue(value) || isLegacyUserRoleValue(value), {
      message: "Выберите корректную должность",
    })
    .optional(),
  phone: z.string().trim().nullable().optional(),
  positionTitle: z.string().trim().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (!isManagerRole(session.user.role)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const user = await db.user.findFirst({
      where: { id, organizationId: session.user.organizationId },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const body = updateUserSchema.parse(await request.json());
    const { name, role, phone, positionTitle, isActive } = body;

    if (id === session.user.id && role && normalizeUserRole(role) !== "manager") {
      return NextResponse.json(
        { error: "Нельзя изменить свою роль" },
        { status: 400 }
      );
    }

    if (id === session.user.id && isActive === false) {
      return NextResponse.json(
        { error: "Нельзя деактивировать себя" },
        { status: 400 }
      );
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(role !== undefined && { role: toCanonicalUserRole(role) }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(positionTitle !== undefined && {
          positionTitle: positionTitle?.trim() || null,
        }),
        ...(isActive !== undefined && { isActive }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        positionTitle: true,
        isActive: true,
        phone: true,
      },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Некорректные данные" },
        { status: 400 }
      );
    }

    console.error("User update error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    if (!isManagerRole(session.user.role)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    if (id === session.user.id) {
      return NextResponse.json({ error: "Нельзя удалить себя" }, { status: 400 });
    }

    const user = await db.user.findFirst({
      where: { id, organizationId: session.user.organizationId },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    await db.user.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("User deletion error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
