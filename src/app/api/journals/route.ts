import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyOrganization } from "@/lib/telegram";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { templateCode, areaId, equipmentId, data } = body;

    if (!templateCode || !data) {
      return NextResponse.json(
        { error: "Некорректные данные" },
        { status: 400 }
      );
    }

    const template = await db.journalTemplate.findUnique({
      where: { code: templateCode },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Шаблон не найден" },
        { status: 404 }
      );
    }

    const entry = await db.journalEntry.create({
      data: {
        templateId: template.id,
        organizationId: session.user.organizationId,
        filledById: session.user.id,
        areaId: areaId || null,
        equipmentId: equipmentId || null,
        data,
        status: "submitted",
      },
    });

    // Check temperature out of range for temp_control entries
    if (templateCode === "temp_control" && equipmentId && data.temperature != null) {
      try {
        const equipment = await db.equipment.findUnique({
          where: { id: equipmentId },
          select: { name: true, tempMin: true, tempMax: true },
        });

        if (equipment) {
          const temp = Number(data.temperature);
          const isOutOfRange =
            (equipment.tempMin != null && temp < equipment.tempMin) ||
            (equipment.tempMax != null && temp > equipment.tempMax);

          if (isOutOfRange) {
            const rangeStr = [
              equipment.tempMin != null ? `от ${equipment.tempMin}` : "",
              equipment.tempMax != null ? `до ${equipment.tempMax}` : "",
            ]
              .filter(Boolean)
              .join(" ");

            const message =
              `<b>Отклонение температуры!</b>\n\n` +
              `Оборудование: <b>${equipment.name}</b>\n` +
              `Зафиксировано: <b>${temp}°C</b>\n` +
              `Допустимый диапазон: ${rangeStr}°C\n` +
              `Сотрудник: ${session.user.name || session.user.email}`;

            // Send notification in background — don't block the response
            notifyOrganization(session.user.organizationId, message).catch(
              (err) => console.error("Notification error:", err)
            );
          }
        }
      } catch (notifError) {
        // Don't fail the journal entry creation because of notification errors
        console.error("Temperature check/notification error:", notifError);
      }
    }

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("Journal entry creation error:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
