import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { areaSchema } from "@/lib/validators";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const areas = await db.area.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { equipment: true } },
      },
    });

    return NextResponse.json({ areas });
  } catch (error) {
    console.error("Areas list error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    if (!["owner", "technologist"].includes(session.user.role)) {
      return NextResponse.json(
        { error: "Недостаточно прав" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = areaSchema.parse(body);

    const area = await db.area.create({
      data: {
        name: validatedData.name,
        description: validatedData.description || null,
        organizationId: session.user.organizationId,
      },
    });

    return NextResponse.json({ area }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Некорректные данные", details: error },
        { status: 400 }
      );
    }

    console.error("Area creation error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
