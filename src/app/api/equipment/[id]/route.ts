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

    if (!["owner", "technologist"].includes(session.user.role)) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const equipment = await db.equipment.findUnique({
      where: { id },
      include: { area: { select: { organizationId: true } } },
    });

    if (!equipment || equipment.area.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Оборудование не найдено" }, { status: 404 });
    }

    const body = await request.json();
    const { name, type, areaId, serialNumber, tempMin, tempMax, tuyaDeviceId } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: "Название обязательно" }, { status: 400 });
    }

    if (areaId) {
      const area = await db.area.findFirst({
        where: { id: areaId, organizationId: session.user.organizationId },
      });
      if (!area) {
        return NextResponse.json({ error: "Цех не найден" }, { status: 400 });
      }
    }

    const updated = await db.equipment.update({
      where: { id },
      data: {
        name: name.trim(),
        type: type || equipment.type,
        areaId: areaId || equipment.areaId,
        serialNumber: serialNumber?.trim() || null,
        tempMin: tempMin !== undefined && tempMin !== "" ? Number(tempMin) : null,
        tempMax: tempMax !== undefined && tempMax !== "" ? Number(tempMax) : null,
        tuyaDeviceId: tuyaDeviceId?.trim() || null,
      },
    });

    return NextResponse.json({ equipment: updated });
  } catch (error) {
    console.error("Equipment update error:", error);
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

    const equipment = await db.equipment.findUnique({
      where: { id },
      include: { area: { select: { organizationId: true } } },
    });

    if (!equipment || equipment.area.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Оборудование не найдено" }, { status: 404 });
    }

    await db.equipment.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Equipment deletion error:", error);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
