import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

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

    if (session.user.role !== "owner") {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const user = await db.user.findFirst({
      where: { id, organizationId: session.user.organizationId },
    });

    if (!user) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    const body = await request.json();
    const { name, role, phone, isActive } = body;

    // Prevent owner from demoting themselves
    if (id === session.user.id && role && role !== "owner") {
      return NextResponse.json(
        { error: "Нельзя изменить свою роль" },
        { status: 400 }
      );
    }

    // Prevent deactivating yourself
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
        ...(role !== undefined && { role }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, phone: true },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("User update error:", error);
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

    if (session.user.role !== "owner") {
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

    // Soft delete — deactivate
    await db.user.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("User deletion error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
