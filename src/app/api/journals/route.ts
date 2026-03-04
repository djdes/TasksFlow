import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyOrganization } from "@/lib/telegram";
import { sendTemperatureAlertEmail, sendDeviationAlertEmail } from "@/lib/email";

// Universal deviation rules for all journal types
type DeviationRule = {
  field: string;
  condition: "equals" | "notEquals" | "outOfRange";
  value?: unknown;
  alertType: string;
  alertMessage: (data: Record<string, unknown>) => string;
};

const DEVIATION_RULES: Record<string, DeviationRule[]> = {
  incoming_control: [
    {
      field: "result",
      condition: "equals",
      value: "rejected",
      alertType: "Входной контроль: БРАК",
      alertMessage: (d) =>
        `Продукт <b>${d.productName || "—"}</b> от поставщика <b>${d.supplier || "—"}</b> забракован.\nПричина: ${d.comment || "не указана"}`,
    },
  ],
  finished_product: [
    {
      field: "approved",
      condition: "equals",
      value: false,
      alertType: "Бракераж: НЕ ДОПУЩЕНО",
      alertMessage: (d) =>
        `Продукт <b>${d.productName || "—"}</b> не прошёл бракераж.\nЗамечания: ${d.comment || "не указаны"}`,
    },
  ],
  hygiene: [
    {
      field: "admitted",
      condition: "equals",
      value: false,
      alertType: "Гигиена: НЕ ДОПУЩЕН К РАБОТЕ",
      alertMessage: (d) =>
        `Сотрудник <b>${d.employeeName || "—"}</b> не допущен к работе.\nПричина: ${d.symptoms || d.comment || "не указана"}`,
    },
  ],
  ccp_monitoring: [
    {
      field: "withinLimits",
      condition: "equals",
      value: false,
      alertType: "ККТ: ВЫХОД ЗА ПРЕДЕЛЫ",
      alertMessage: (d) =>
        `Критическая контрольная точка вышла за пределы!\nФакт: ${d.actualValue || "—"}\nДопуск: ${d.criticalLimit || "—"}\nКорректирующее действие: ${d.correctiveAction || "не указано"}`,
    },
  ],
  cleaning: [
    {
      field: "result",
      condition: "equals",
      value: "unsatisfactory",
      alertType: "Уборка: НЕУДОВЛ.",
      alertMessage: (d) =>
        `Результат уборки неудовлетворительный.\nТип: ${d.cleaningType || "—"}\nЗамечания: ${d.comment || "не указаны"}`,
    },
  ],
  cooking_temp: [
    {
      field: "withinNorm",
      condition: "equals",
      value: false,
      alertType: "Температура приготовления: ОТКЛОНЕНИЕ",
      alertMessage: (d) =>
        `Температура приготовления вне нормы!\nПродукт: <b>${d.productName || "—"}</b>\nТемпература: ${d.temperature || "—"}°C\nКорр. действие: ${d.correctiveAction || "не указано"}`,
    },
  ],
  shipment: [
    {
      field: "vehicleCondition",
      condition: "equals",
      value: "unsatisfactory",
      alertType: "Отгрузка: НЕУДОВЛ. состояние ТС",
      alertMessage: (d) =>
        `Неудовлетворительное состояние транспорта!\nТС: ${d.vehicleNumber || "—"}\nЗамечания: ${d.comment || "не указаны"}`,
    },
  ],
  equipment_calibration: [
    {
      field: "result",
      condition: "equals",
      value: "failed",
      alertType: "Поверка: НЕ ПРОЙДЕНА",
      alertMessage: (d) =>
        `Оборудование не прошло поверку!\nПрибор: <b>${d.instrumentName || "—"}</b>\nЗамечания: ${d.comment || "не указаны"}`,
    },
  ],
  product_writeoff: [
    {
      field: "quantity",
      condition: "notEquals",
      value: undefined,
      alertType: "Списание продукции",
      alertMessage: (d) =>
        `Списание: <b>${d.productName || "—"}</b>\nКоличество: ${d.quantity || "—"} ${d.unit || ""}\nПричина: ${d.reason || "не указана"}`,
    },
  ],
};

function checkDeviations(
  templateCode: string,
  data: Record<string, unknown>
): { alertType: string; details: string }[] {
  const rules = DEVIATION_RULES[templateCode];
  if (!rules) return [];

  const triggered: { alertType: string; details: string }[] = [];

  for (const rule of rules) {
    const fieldValue = data[rule.field];
    let isDeviation = false;

    switch (rule.condition) {
      case "equals":
        isDeviation = fieldValue === rule.value;
        break;
      case "notEquals":
        // Triggers when the field has any value (used for writeoffs — any writeoff is notable)
        isDeviation = fieldValue != null && fieldValue !== "" && fieldValue !== 0;
        break;
    }

    if (isDeviation) {
      triggered.push({
        alertType: rule.alertType,
        details: rule.alertMessage(data),
      });
    }
  }

  return triggered;
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

    const filledByName = session.user.name || session.user.email || "";

    // --- Temperature-specific alert (with equipment range check) ---
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
              `Сотрудник: ${filledByName}`;

            notifyOrganization(session.user.organizationId, message, ["owner", "technologist"], "temperature").catch(
              (err) => console.error("Telegram notification error:", err)
            );

            db.user
              .findMany({
                where: {
                  organizationId: session.user.organizationId,
                  role: { in: ["owner", "technologist"] },
                  isActive: true,
                },
                select: { email: true },
              })
              .then((users) => {
                for (const user of users) {
                  sendTemperatureAlertEmail({
                    to: user.email,
                    equipmentName: equipment.name,
                    temperature: temp,
                    tempMin: equipment.tempMin,
                    tempMax: equipment.tempMax,
                    filledBy: filledByName,
                  });
                }
              })
              .catch((err) => console.error("Email alert error:", err));
          }
        }
      } catch (notifError) {
        console.error("Temperature check/notification error:", notifError);
      }
    }

    // --- Universal deviation alerts for all journal types ---
    const deviations = checkDeviations(templateCode, data as Record<string, unknown>);
    if (deviations.length > 0) {
      try {
        for (const deviation of deviations) {
          const telegramMsg =
            `<b>${deviation.alertType}</b>\n\n` +
            `${deviation.details}\n\n` +
            `Журнал: ${template.name}\n` +
            `Сотрудник: ${filledByName}`;

          notifyOrganization(session.user.organizationId, telegramMsg, ["owner", "technologist"], "deviations").catch(
            (err) => console.error("Telegram deviation alert error:", err)
          );
        }

        // Email alerts to owners/technologists
        db.user
          .findMany({
            where: {
              organizationId: session.user.organizationId,
              role: { in: ["owner", "technologist"] },
              isActive: true,
            },
            select: { email: true },
          })
          .then((users) => {
            for (const deviation of deviations) {
              for (const user of users) {
                sendDeviationAlertEmail({
                  to: user.email,
                  journalName: template.name,
                  journalCode: templateCode,
                  deviationType: deviation.alertType,
                  details: deviation.details.replace(/<\/?b>/g, ""),
                  filledBy: filledByName,
                });
              }
            }
          })
          .catch((err) => console.error("Email deviation alert error:", err));
      } catch (deviationError) {
        console.error("Deviation alert error:", deviationError);
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
