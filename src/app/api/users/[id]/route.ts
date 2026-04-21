import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
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
import { normalizePhone } from "@/lib/phone";
import { tryAutolinkTasksflowByPhone } from "@/lib/tasksflow-autolink";

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

    // Normalize phone before saving so every downstream consumer
    // (TasksFlow link, adapter display, Telegram invite) sees a clean
    // `+7XXXXXXXXXX`. Null-clear stays allowed — owner is allowed to
    // scrub a phone from a record.
    let normalizedPhone: string | null | undefined;
    if (phone !== undefined) {
      const trimmed = phone?.trim() ?? "";
      if (trimmed === "") {
        normalizedPhone = null;
      } else {
        const parsed = normalizePhone(trimmed);
        if (!parsed) {
          return NextResponse.json(
            {
              error:
                "Неверный формат телефона. Пример: +7 985 123-45-67",
            },
            { status: 400 }
          );
        }
        normalizedPhone = parsed;
      }
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(role !== undefined && { role: toCanonicalUserRole(role) }),
        ...(normalizedPhone !== undefined && { phone: normalizedPhone }),
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

    // If the phone just changed (or appeared), try to auto-link the user
    // to the matching TasksFlow worker. Fire-and-forget so a slow TF
    // response doesn't stall the PUT.
    if (normalizedPhone) {
      tryAutolinkTasksflowByPhone({
        organizationId: session.user.organizationId,
        weSetupUserId: id,
        phone: normalizedPhone,
      }).catch((err) => {
        console.error("[users/PUT] autolink failed", err);
      });
    }

    // Имя или должность поменялись — прокатим label по Notification.items
    // в рамках организации. Иначе в колокольчике застрял бы устаревший
    // текст «Иван опечатка, Повар» до dismiss.
    if (name !== undefined || positionTitle !== undefined) {
      const newLabel = updated.positionTitle
        ? `${updated.name}, ${updated.positionTitle}`
        : updated.name;
      const notifications = await db.notification.findMany({
        where: { organizationId: session.user.organizationId },
        select: { id: true, items: true },
      });
      for (const n of notifications) {
        const list = Array.isArray(n.items) ? (n.items as unknown[]) : [];
        let changed = false;
        const nextItems = list.map((raw) => {
          if (!raw || typeof raw !== "object") return raw;
          const item = raw as { id?: string; label?: string };
          if (item.id === id && item.label !== newLabel) {
            changed = true;
            return { ...item, label: newLabel };
          }
          return raw;
        });
        if (changed) {
          await db.notification.update({
            where: { id: n.id },
            data: { items: nextItems as Prisma.InputJsonValue },
          });
        }
      }
    }

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
