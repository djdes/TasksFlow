import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    if (session.user.role !== "owner") {
      return NextResponse.json(
        { error: "Недостаточно прав" },
        { status: 403 }
      );
    }

    const area = await db.area.findUnique({
      where: { id },
    });

    if (!area || area.organizationId !== session.user.organizationId) {
      return NextResponse.json(
        { error: "Цех не найден" },
        { status: 404 }
      );
    }

    await db.area.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Area deletion error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
