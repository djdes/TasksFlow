import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { equipmentSchema } from "@/lib/validators";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const equipment = await db.equipment.findMany({
      where: {
        area: { organizationId: session.user.organizationId },
      },
      orderBy: { name: "asc" },
      include: {
        area: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ equipment });
  } catch (error) {
    console.error("Equipment list error:", error);
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
    const validatedData = equipmentSchema.parse(body);

    // Verify areaId belongs to org
    const area = await db.area.findUnique({
      where: { id: validatedData.areaId },
    });

    if (!area || area.organizationId !== session.user.organizationId) {
      return NextResponse.json(
        { error: "Цех не найден" },
        { status: 404 }
      );
    }

    const equipment = await db.equipment.create({
      data: {
        name: validatedData.name,
        type: validatedData.type,
        serialNumber: validatedData.serialNumber || null,
        tempMin: validatedData.tempMin ?? null,
        tempMax: validatedData.tempMax ?? null,
        tuyaDeviceId: validatedData.tuyaDeviceId || null,
        areaId: validatedData.areaId,
      },
    });

    return NextResponse.json({ equipment }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Некорректные данные", details: error },
        { status: 400 }
      );
    }

    console.error("Equipment creation error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
