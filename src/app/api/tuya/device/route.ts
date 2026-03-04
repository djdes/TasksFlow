import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDeviceTemperature } from "@/lib/tuya";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const equipmentId = searchParams.get("equipmentId");

    if (!equipmentId) {
      return NextResponse.json(
        { error: "equipmentId is required" },
        { status: 400 }
      );
    }

    // Verify equipment belongs to user's org
    const equipment = await db.equipment.findUnique({
      where: { id: equipmentId },
      include: { area: true },
    });

    if (
      !equipment ||
      equipment.area.organizationId !== session.user.organizationId
    ) {
      return NextResponse.json(
        { error: "Оборудование не найдено" },
        { status: 404 }
      );
    }

    if (!equipment.tuyaDeviceId) {
      return NextResponse.json(
        { error: "К этому оборудованию не привязан IoT-датчик" },
        { status: 400 }
      );
    }

    const { temperature, humidity } = await getDeviceTemperature(
      equipment.tuyaDeviceId
    );

    return NextResponse.json({
      temperature,
      humidity,
      equipmentName: equipment.name,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Tuya device fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка IoT-датчика" },
      { status: 500 }
    );
  }
}
