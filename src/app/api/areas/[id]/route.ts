import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server-session";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isManagementRole, isManagerRole } from "@/lib/user-roles";

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

    if (!isManagementRole(session.user.role)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const area = await db.area.findUnique({ where: { id } });
    if (!area || area.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Цех не найден" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: "Название обязательно" }, { status: 400 });
    }

    const updated = await db.area.update({
      where: { id },
      data: {
        name: name.trim(),
        description: description?.trim() || null,
      },
    });

    return NextResponse.json({ area: updated });
  } catch (error) {
    console.error("Area update error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
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

    const area = await db.area.findUnique({ where: { id } });
    if (!area || area.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Цех не найден" }, { status: 404 });
    }

    await db.area.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Area deletion error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
